import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

test('首页真实摘要和完整备份；无效文件、导入故障保留旧数据，恢复后所有模块一致', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage6-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch('http://127.0.0.1:8765')).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 80)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, acceptDownloads: true })
    const page = context.pages()[0] || await context.newPage()
    await page.goto('http://127.0.0.1:8765')
    await page.locator('#quick-memo').fill('备份可恢复')
    await page.getByRole('button', { name: '保存备忘' }).click()
    await page.getByRole('navigation').getByRole('button', { name: '饮食计划' }).click()
    await page.getByLabel('吃什么').fill('备份午餐')
    await page.getByLabel('实际花费', { exact: true }).fill('19.80')
    await page.getByRole('button', { name: '保存餐次' }).click()
    await page.getByText(/备份午餐 · ¥19.80/).waitFor()
    await page.getByRole('navigation').getByRole('button', { name: '游戏娱乐' }).click()
    await page.getByLabel('娱乐项目').fill('备份娱乐')
    await page.getByLabel('实际时长').fill('23')
    await page.getByRole('button', { name: '保存娱乐记录' }).click()
    await page.getByText(/备份娱乐 .* 实际 23 分钟/).waitFor()
    await page.getByRole('navigation').getByRole('button', { name: '羽毛球' }).click()
    await page.getByLabel('训练内容').fill('备份训练')
    await page.getByLabel('个人感受').fill('很好')
    await page.getByLabel('消耗球数').fill('2')
    await page.getByRole('button', { name: '保存打球记录' }).click()
    await page.getByText(/1 次 · 60 分钟 · 消耗 2 个球/).waitFor()
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.locator('.tasks-view-switch').getByRole('button', { name: '日' }).click()
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('备份任务')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('备份任务', { exact: true }).waitFor()
    await page.getByRole('button', { name: '打卡' }).click()
    await page.getByRole('button', { name: '确认打卡' }).click()
    await page.getByText(/已完成 100%/).waitFor()
    await page.getByRole('button', { name: '闹之钟，返回首页总览' }).click()
    await page.getByText('1 / 1 项已结算').waitFor()
    assert.match(await page.locator('#main-content').innerText(), /备份午餐[\s\S]*备份娱乐[\s\S]*2 个球/)
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    await page.getByText(/计划：1 条，已结算 1 条/).waitFor()
    await page.locator('#theme-choice').selectOption('cool')
    await page.locator('#font-choice').selectOption('source-han-sans')
    await page.waitForFunction(async () => {
      const db = await new Promise(resolve => { const r=indexedDB.open('personal-rhythm-v1'); r.onsuccess=()=>resolve(r.result) })
      return await new Promise(resolve => {
        const r = db.transaction('settings').objectStore('settings').getAll()
        r.onsuccess = () => {
          const settings = r.result
          resolve(settings.some(row => row.key === 'theme' && row.value === 'cool') &&
            settings.some(row => row.key === 'font' && row.value === 'source-han-sans'))
        }
        r.onerror = () => resolve(false)
      })
    })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出完整备份' }).click()
    const download = await downloadPromise
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'))
    assert.deepEqual(Object.keys(backup.data).sort(), ['badminton','entertainment','meals','occurrences','settings','templates','timers'].sort())
    assert.equal(backup.version, 2, '备份格式为 v2（不含金币流水）')
    assert.equal(backup.data.meals[0].spent, 19.8)
    const file = page.locator('#backup-file')
    await file.setInputFiles({ name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') })
    await page.getByRole('status').getByText(/备份无效，原数据未改变/).waitFor()
    assert.match(await page.locator('#main-content').innerText(), /饮食：1 餐/)
    await file.setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.getByRole('button', { name: '确认替换并恢复' }).waitFor()
    // Inject an IndexedDB write error after transaction.clear; the entire import must roll back.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'badminton') throw new Error('模拟导入写入故障')
        return original.apply(this, args)
      }
      window.restorePut = () => { IDBObjectStore.prototype.put = original }
    })
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: '确认替换并恢复' }).click()
    await page.getByRole('status').getByText(/恢复失败，原数据未改变/).waitFor()
    assert.match(await page.locator('#main-content').innerText(), /饮食：1 餐/)
    await page.evaluate(() => window.restorePut())
    // Alter current data to verify that importing really replaces all records.
    await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r=indexedDB.open('personal-rhythm-v1'); r.onsuccess=()=>resolve(r.result) })
      await new Promise(resolve => { const tx=db.transaction(['meals','entertainment','badminton','occurrences','templates','settings','timers'], 'readwrite')
        for (const name of ['meals','entertainment','badminton','occurrences','templates','settings','timers']) tx.objectStore(name).clear()
        tx.oncomplete=resolve
      })
    })
    await page.getByRole('button', { name: '确认替换并恢复' }).click()
    await page.getByRole('status').getByText('恢复成功，所有数据已替换').waitFor()
    await page.reload()
    await page.getByRole('button', { name: '闹之钟，返回首页总览' }).click()
    await page.waitForFunction(() => document.querySelector('#quick-memo')?.value === '备份可恢复')
    await page.getByText('1 / 1 项已结算').waitFor()
    assert.match(await page.locator('#main-content').innerText(), /备份午餐[\s\S]*备份娱乐[\s\S]*2 个球/)
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    assert.equal(await page.locator('#theme-choice').inputValue(), 'cool')
    assert.equal(await page.locator('#font-choice').inputValue(), 'source-han-sans')
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

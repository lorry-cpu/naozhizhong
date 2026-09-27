import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

test('重复任务逐日独立，计时在暂停和重新打开浏览器后正确恢复', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage3-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  let context
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch('http://127.0.0.1:8765')).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 80)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    let page = context.pages()[0] || await context.newPage()
    await page.goto('http://127.0.0.1:8765')
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.locator('.tasks-view-switch').getByRole('button', { name: '日' }).click()
    const today = await page.locator('input[aria-label="查看日期"]').inputValue()
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('阶段三每周训练')
    await page.getByLabel('重复').selectOption('weekly')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('阶段三每周训练', { exact: true }).waitFor()
    const nextWeek = await page.evaluate(date => {
      const [y,m,d] = date.split('-').map(Number)
      const next = new Date(y,m-1,d+7)
      return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`
    }, today)
    await page.locator('input[aria-label="查看日期"]').fill(nextWeek)
    await page.getByText('阶段三每周训练', { exact: true }).waitFor()
    const instances = await page.evaluate(async () => {
      const db = await new Promise((resolve,reject) => { const r=indexedDB.open('personal-rhythm-v1'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error) })
      return new Promise((resolve,reject) => { const r=db.transaction('occurrences').objectStore('occurrences').getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error) })
    })
    assert.equal(instances.filter(item => item.title === '阶段三每周训练').length, 2)
    await page.locator('input[aria-label="查看日期"]').fill(today)
    await page.getByRole('button', { name: '开始计时' }).click()
    await page.waitForTimeout(1150)
    await page.getByRole('button', { name: '暂停计时' }).click()
    const paused = await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r=indexedDB.open('personal-rhythm-v1'); r.onsuccess=()=>resolve(r.result) })
      const records = await new Promise(resolve => { const r=db.transaction('timers').objectStore('timers').getAll(); r.onsuccess=()=>resolve(r.result) })
      return records[0]
    })
    assert.equal(paused.startedAt, null)
    await page.waitForTimeout(1100)
    await page.getByRole('button', { name: '继续计时' }).click()
    await page.getByRole('button', { name: '暂停计时' }).waitFor()
    await context.close()
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    page = context.pages()[0] || await context.newPage()
    await page.goto('http://127.0.0.1:8765')
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.getByRole('button', { name: '暂停计时' }).waitFor()
    await page.waitForTimeout(1100)
    assert.match(await page.locator('.task-detail small').first().textContent(), /已计时 00:0[2-9]/)
    await page.locator('input[aria-label="查看日期"]').fill(nextWeek)
    await page.getByText('阶段三每周训练', { exact: true }).waitFor()
    await page.reload()
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.locator('input[aria-label="查看日期"]').fill(nextWeek)
    await page.getByText('阶段三每周训练', { exact: true }).waitFor()
    assert.equal(await page.getByText('阶段三每周训练', { exact: true }).count(), 1)
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

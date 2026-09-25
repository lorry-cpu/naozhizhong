import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'
async function records(page, table) {
  return page.evaluate(async table => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('personal-rhythm-v1')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return new Promise((resolve, reject) => {
      const req = db.transaction(table).objectStore(table).getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }, table)
}
test('结算事务、补算零点、负数余额与双标签兑换幂等', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage4-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 80)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(origin)
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('失败回滚任务')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('失败回滚任务', { exact: true }).waitFor()
    const [first] = await records(page, 'occurrences')
    await page.evaluate(async id => {
      const db = await new Promise(resolve => { const r = indexedDB.open('personal-rhythm-v1'); r.onsuccess = () => resolve(r.result) })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('ledger', 'readwrite')
        tx.objectStore('ledger').add({ id: 'collision', sourceKey: `task:${id}`, at: Date.now(), amount: 0, reason: '模拟唯一键冲突' })
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error)
      })
    }, first.id)
    await page.getByRole('button', { name: '打卡' }).click()
    await page.getByRole('button', { name: '确认打卡' }).click()
    await page.waitForTimeout(300)
    assert.equal((await records(page, 'occurrences'))[0].status, 'pending', '流水冲突时任务状态不得写入')
    await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r = indexedDB.open('personal-rhythm-v1'); r.onsuccess = () => resolve(r.result) })
      await new Promise(resolve => {
        const tx = db.transaction('ledger', 'readwrite')
        tx.objectStore('ledger').delete('collision')
        tx.oncomplete = resolve
      })
    })
    await page.getByRole('button', { name: '确认打卡' }).click()
    await page.getByText(/已结算 100%/).waitFor()
    assert.equal((await records(page, 'ledger')).filter(e => e.sourceKey === `task:${first.id}`).length, 1)
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('过期待补算')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('过期待补算', { exact: true }).waitFor()
    const due = (await records(page, 'occurrences')).find(r => r.title === '过期待补算')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`
    const start = new Date(...date.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))).getTime()
    await page.evaluate(async ({ id, date, startedAt }) => {
      const db = await new Promise(resolve => { const r = indexedDB.open('personal-rhythm-v1'); r.onsuccess = () => resolve(r.result) })
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['occurrences','timers'], 'readwrite')
        const store = tx.objectStore('occurrences')
        const get = store.get(id)
        get.onsuccess = () => {
          store.put({ ...get.result, date })
          tx.objectStore('timers').put({ id, accumulatedMs: 500, startedAt })
        }
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error)
      })
    }, { id: due.id, date, startedAt: start + 23 * 60 * 60 * 1000 })
    await page.reload()
    await page.waitForFunction(id => {
      return new Promise(resolve => {
        const r = indexedDB.open('personal-rhythm-v1')
        r.onsuccess = () => {
          const get = r.result.transaction('occurrences').objectStore('occurrences').get(id)
          get.onsuccess = () => resolve(get.result?.status === 'settled')
        }
      })
    }, due.id)
    const after = (await records(page, 'occurrences')).find(r => r.id === due.id)
    assert.equal(after.payout, -6)
    assert.equal(after.settledAt, start + 86400000)
    const timer = (await records(page, 'timers')).find(r => r.id === due.id)
    assert.equal(timer.startedAt, null)
    assert.equal(timer.accumulatedMs, 3600000 + 500)
    await page.reload()
    assert.equal((await records(page, 'ledger')).filter(e => e.sourceKey === `task:${due.id}`).length, 1)
    // The first task paid 6; the missed task costs 6. Spendable coins remain zero.
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    assert.match(await page.locator('#main-content').innerText(), /当前余额：0 金币/)
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('困难高收益')
    await page.getByLabel('预计分钟').fill('1440')
    await page.getByLabel('难度').selectOption('hard')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('困难高收益', { exact: true }).waitFor()
    await page.locator('.task-row').filter({ hasText: '困难高收益' }).getByRole('button', { name: '打卡' }).click()
    await page.getByRole('button', { name: '确认打卡' }).click()
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    await page.getByText('当前余额：672 金币').waitFor()
    const other = await context.newPage()
    await other.goto(origin)
    await other.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    page.on('dialog', dialog => dialog.accept())
    other.on('dialog', dialog => dialog.accept())
    await other.locator('.summary-card').filter({ hasText: '清爽冷调' }).getByRole('button', { name: '兑换风格' }).waitFor()
    await Promise.all([
      page.evaluate(() => [...document.querySelectorAll('.summary-card')].find(card => card.textContent.includes('清爽冷调')).querySelector('button').click()),
      other.evaluate(() => [...document.querySelectorAll('.summary-card')].find(card => card.textContent.includes('清爽冷调')).querySelector('button').click()),
    ])
    await page.getByText('当前余额：582 金币').waitFor()
    assert.equal((await records(page, 'ledger')).filter(e => e.reason.includes('清爽冷调')).length, 1)
    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'cool')
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'cool')
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

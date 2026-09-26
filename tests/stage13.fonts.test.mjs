import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'

async function records(page, table) {
  return page.evaluate(async tableName => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('personal-rhythm-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return new Promise((resolve, reject) => {
      const request = db.transaction(tableName).objectStore(tableName).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }, table)
}

test('字体默认仿宋，字体可预览、以 200 金币购买并持久化', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage13-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(origin)).ok) break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 80))
      }
    }
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
    })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(origin)
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    await page.getByRole('heading', { name: '字体商店' }).waitFor()

    assert.equal(await page.locator('[data-testid^="font-card-"]').count(), 7)
    assert.equal(await page.locator('[data-testid="font-card-fangsong"] .font-preview').count(), 1)
    assert.equal(await page.locator('[data-testid="font-card-kaiti"]').innerText().then(text => /200 金币/.test(text)), true)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.font), 'fangsong')
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily.includes('NaoFangSong')), true)
    assert.equal(await page.evaluate(async () => (await fetch('/fonts/kaiti.ttf')).ok), true)

    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('personal-rhythm-v1')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('ledger', 'readwrite')
        tx.objectStore('ledger').add({
          id: 'font-test-coins',
          sourceKey: 'font-test-coins',
          amount: 200,
          at: Date.now(),
          reason: '字体测试奖励',
        })
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    })
    await page.reload()
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    page.on('dialog', dialog => dialog.accept())
    await page.locator('[data-testid="font-card-kaiti"]').getByRole('button', { name: '购买并使用' }).click()
    await page.waitForFunction(() => document.documentElement.dataset.font === 'kaiti')
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily.includes('NaoKaiTi')), true)
    assert.match(await page.locator('[data-testid="font-card-kaiti"]').innerText(), /使用中/)
    assert.equal((await records(page, 'ledger')).filter(entry => entry.reason.includes('购买字体')).length, 1)
    assert.equal((await records(page, 'settings')).find(row => row.key === 'font')?.value, 'kaiti')

    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.font === 'kaiti')
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    assert.equal(await page.locator('#main-content').locator('[data-testid="font-card-kaiti"]').getByRole('button').innerText(), '使用中')
    assert.equal((await records(page, 'ledger')).reduce((sum, entry) => sum + entry.amount, 0), 0)
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

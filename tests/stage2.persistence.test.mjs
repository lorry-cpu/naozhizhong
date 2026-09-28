import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

test('备忘和风格在刷新及关闭浏览器后仍存在，写入失败有提示', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage2-'))
  assert.ok(path.resolve(profile).startsWith(path.resolve(tmpdir()) + path.sep))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true })
    let page = context.pages()[0] || await context.newPage()
    await page.goto(origin)
    await page.locator('#quick-memo').fill('明天买三只球')
    await page.getByRole('button', { name: '保存备忘' }).click()
    await page.getByRole('status').getByText('备忘已保存到本机').waitFor()
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('personal-rhythm-v1')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite')
        tx.objectStore('settings').put({ key: 'unlocked:focus', value: true })
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    })
    await page.reload()
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    await page.locator('#theme-choice').selectOption('focus')
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'focus')
    await page.reload()
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    assert.equal(await page.locator('#theme-choice').inputValue(), 'focus')
    assert.match(await page.getByTestId('storage-status').textContent(), /本地存储可用/)
    await context.close()
    context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true })
    page = context.pages()[0] || await context.newPage()
    await page.goto(origin)
    await page.waitForFunction(() => document.querySelector('#quick-memo')?.value === '明天买三只球')
    assert.equal(await page.locator('#quick-memo').inputValue(), '明天买三只球')
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'focus')
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') throw new Error('模拟写入失败')
        return original.apply(this, args)
      }
    })
    await page.locator('#quick-memo').fill('这条不能保存')
    await page.getByRole('button', { name: '保存备忘' }).click()
    assert.match(await page.getByRole('status').textContent(), /备忘保存失败/)
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

// 字体改为运行时下载后新增了 fontBlobs 表，数据库版本从 1 升到 2。
// 老用户升级时不能丢数据，也不能因为重复建索引而卡在升级中。
test('数据库从 v1 升级到 v2 时保留原有数据并新增字体缓存表', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-upgrade-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true })
    const page = context.pages()[0] || await context.newPage()
    // 先访问一个不存在的路径：拿到同源环境但不启动应用，好手工建出 v1 旧库。
    await page.goto(`${origin}/__setup__`)
    const oldVersion = await page.evaluate(async () => {
      await new Promise(resolve => {
        const request = indexedDB.deleteDatabase('personal-rhythm-v1')
        request.onsuccess = request.onerror = request.onblocked = () => resolve()
      })
      return await new Promise(resolve => {
        const open = indexedDB.open('personal-rhythm-v1', 1)
        open.onupgradeneeded = () => {
          const db = open.result
          for (const name of ['templates', 'occurrences', 'timers', 'ledger', 'meals', 'entertainment', 'badminton', 'settings']) {
            db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' })
          }
          const tx = open.transaction
          tx.objectStore('occurrences').createIndex('date', 'date')
          tx.objectStore('ledger').createIndex('sourceKey', 'sourceKey', { unique: true })
        }
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: 'memo', value: '升级前的备忘' })
          tx.oncomplete = () => { const version = db.version; db.close(); resolve(version) }
          tx.onerror = () => resolve('ERR')
        }
        open.onerror = () => resolve('ERR')
      })
    })
    assert.equal(oldVersion, 1, '已构造出 v1 旧库')

    await page.goto(origin)
    await page.waitForTimeout(800)
    const state = await page.evaluate(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open('personal-rhythm-v1'); request.onsuccess = () => resolve(request.result) })
      const stores = [...db.objectStoreNames]
      const memo = await new Promise(resolve => {
        const request = db.transaction('settings').objectStore('settings').get('memo')
        request.onsuccess = () => resolve(request.result?.value)
      })
      return { version: db.version, hasFontBlobs: stores.includes('fontBlobs'), memo }
    })
    assert.equal(state.version, 2, '数据库已升级到 v2')
    assert.equal(state.hasFontBlobs, true, '新增字体缓存表')
    assert.equal(state.memo, '升级前的备忘', '升级后原有数据仍在')
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

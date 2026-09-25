import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

test('首页不重复显示金币余额，余额只在右上角显示图标、数量和￥', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage()
    await page.goto(origin)
    assert.equal(await page.getByRole('heading', { name: '金币余额' }).count(), 0)
    assert.equal(await page.getByRole('navigation').getByRole('button', { name: '首页总览' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /￥$/ }).count(), 1)
    assert.equal(await page.locator('.top-balance').count(), 1)
    assert.equal(await page.locator('.topbar .top-balance').count(), 1)
    assert.doesNotMatch(await page.locator('.top-balance').innerText(), /金币/)
  } finally {
    await browser?.close()
    server.kill()
  }
})

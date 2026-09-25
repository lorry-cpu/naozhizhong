import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

test('左上角品牌显示为闹之钟', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage()
    await page.goto(origin)
    assert.equal(await page.title(), '闹之钟')
    assert.equal(await page.locator('.brand').locator('span').nth(1).innerText(), '闹之钟')
    assert.equal(await page.getByText('闹之钟', { exact: true }).count(), 1)
    assert.equal(await page.getByText('自己的节奏', { exact: true }).count(), 0)
  } finally {
    await browser?.close()
    server.kill()
  }
})

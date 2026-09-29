import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

// 金币机制已整体移除：导航里不再有「金币与风格」，顶部也不再显示余额。
test('首页不显示金币余额，导航与顶部不再有金币入口', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage()
    await page.goto(origin)

    // 首页本来就只有一个标题，不再重复展示金币。
    assert.equal(await page.getByRole('heading', { name: '金币余额' }).count(), 0)
    // 顶部不再有余额按钮，导航里也没有金币页。
    assert.equal(await page.locator('.top-balance').count(), 0, '顶部余额按钮已移除')
    assert.equal(await page.getByRole('button', { name: /￥$/ }).count(), 0, '不再有￥金额按钮')
    assert.equal(await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).count(), 0, '导航不再有金币页')
    // 首页正文里也不应出现「金币」字样。
    assert.doesNotMatch(await page.locator('#main-content').innerText(), /金币/)
  } finally {
    await browser?.close()
    server.kill()
  }
})

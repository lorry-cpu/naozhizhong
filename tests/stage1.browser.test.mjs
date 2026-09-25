import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

test('真实浏览器离线加载七个模块，顶部图标导航和品牌返回首页仍可用', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break }
      catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const remote = []
    await page.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue()
      remote.push(route.request().url())
      return route.abort()
    })
    await page.goto(origin)
    for (const title of ['备忘录', '今日计划', '饮食计划', '游戏娱乐', '羽毛球', '金币与风格', '数据与设置']) {
      await page.getByRole('navigation', { name: '应用导航' }).getByRole('button', { name: title }).click()
      assert.equal(await page.locator('#main-content h1').textContent(), title)
    }
    await page.getByRole('button', { name: '闹之钟，返回首页总览' }).click()
    assert.equal(await page.locator('#main-content h1').textContent(), '首页总览')
    assert.deepEqual(remote, [], '页面运行不得请求外部资源')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  } finally {
    await browser?.close()
    server.kill()
  }
})

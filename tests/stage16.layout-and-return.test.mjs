import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

test('页面统一缩放、长列表在卡片内滚动并可返回总览', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        if ((await fetch(origin)).ok) { ready = true; break }
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    assert.equal(ready, true, '本地页面能够打开')
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(origin)

    const desktopScale = await page.locator('.app-shell').evaluate(element => Number.parseFloat(getComputedStyle(element).zoom))
    assert.ok(desktopScale > 0 && desktopScale < 1, '桌面端整体页面使用缩放比例')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '桌面端没有横向滚动')

    const navigation = page.getByRole('navigation', { name: '应用导航' })
    for (const [title, heading] of [
      ['备忘录', '备忘录'],
      ['今日计划', '今日计划'],
      ['饮食计划', '饮食计划'],
      ['游戏娱乐', '游戏娱乐'],
      ['羽毛球', '羽毛球'],
      ['金币与风格', '金币与风格'],
      ['数据与设置', '数据与设置'],
    ]) {
      await navigation.getByRole('button', { name: title }).click()
      await page.getByRole('heading', { name: heading }).waitFor()
      assert.equal(await page.getByRole('button', { name: '返回总览' }).count(), 1, `${title} 页面有返回总览按钮`)
      await page.getByRole('button', { name: '返回总览' }).click()
      await page.getByRole('heading', { name: '首页总览' }).waitFor()
    }

    await navigation.getByRole('button', { name: '备忘录' }).click()
    assert.equal(await page.locator('.memo-records-scroll').evaluate(element => getComputedStyle(element).overflowY), 'auto')
    assert.notEqual(await page.locator('.memo-records-scroll').evaluate(element => getComputedStyle(element).maxHeight), 'none')

    await navigation.getByRole('button', { name: '今日计划' }).click()
    await page.locator('.tasks-view-switch').getByRole('button', { name: '日' }).click()
    assert.equal(await page.locator('.tasks-list-scroll').evaluate(element => getComputedStyle(element).overflowY), 'auto')
    assert.notEqual(await page.locator('.tasks-list-scroll').evaluate(element => getComputedStyle(element).maxHeight), 'none')

    await page.setViewportSize({ width: 390, height: 844 })
    const mobileScale = await page.locator('.app-shell').evaluate(element => Number.parseFloat(getComputedStyle(element).zoom))
    assert.ok(mobileScale > 0 && mobileScale < 1, '窄屏页面也使用适度缩放')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '窄屏没有横向滚动')
  } finally {
    await browser?.close()
    server.kill()
  }
})

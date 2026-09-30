import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

test('今日计划、饮食、娱乐和羽毛球都用月历选择日期', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage()
    await page.goto(origin)
    const nav = name => page.getByRole('navigation').getByRole('button', { name })
    const pages = [
      ['今日计划', '计划日历', '这一天还没有计划'],
      ['饮食计划', '饮食日历', '的餐次'],
      ['游戏娱乐', '娱乐日历', '的娱乐安排'],
      ['羽毛球', '羽毛球日历', '的打球记录'],
    ]
    for (const [title, calendarName, headingPart] of pages) {
      await nav(title).click()
      assert.equal(await page.getByRole('region', { name: calendarName }).count(), title === '今日计划' ? 1 : 0)
      assert.equal(await page.locator(`[aria-label="${calendarName}"]`).count(), 1)
      if (title === '今日计划') await page.locator('.tasks-view-switch').getByRole('button', { name: '月' }).click()
      const selected = page.locator('.calendar-day.selected')
      assert.equal(await selected.count(), 1)
      const current = await selected.getAttribute('aria-label')
      assert.ok(current)
      const nextDate = current.startsWith('2026-09-25') ? '2026-09-26' : '2026-09-25'
      await page.getByRole('button', { name: nextDate, exact: true }).click()
      // 月／周视图点某一天都会切到日视图，所以四个页面都应该落到日视图，
      // 并且选中的就是刚点的那一天。
      await page.getByLabel('日视图').waitFor()
      assert.equal(
        await page.locator('.tasks-view-switch button.active').innerText(),
        '日',
        `${title} 点日期后切到日视图`,
      )
      if (title === '今日计划') {
        assert.equal(await page.getByLabel('查看日期').inputValue(), nextDate)
      }
      assert.match(await page.locator('#main-content').innerText(), new RegExp(headingPart))
    }
  } finally {
    await browser?.close()
    server.kill()
  }
})

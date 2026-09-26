import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

test('导航图标保持统一，普通首页标题与导航匹配且仍可操作', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break }
      catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(origin)
    const navigation = page.getByRole('navigation', { name: '应用导航' })
    const categories = [
      ['备忘录', '备忘录', 'memo', false],
      ['今日计划', '今日计划', 'tasks', true],
      ['饮食计划', '今日饮食', 'food', false],
      ['游戏娱乐', '游戏娱乐', 'fun', false],
      ['羽毛球', '运动健康', 'badminton', false],
    ]

    for (const [section, heading, name, titleIconRequired] of categories) {
      const card = page.getByRole('heading', { name: heading })
      const titleIcon = card.locator('.home-heading-icon svg')
      const navIcon = navigation.getByRole('button', { name: section }).locator('svg')
      assert.equal(await titleIcon.count(), titleIconRequired ? 1 : 0,
        titleIconRequired ? `${heading} 标题有图标` : `${heading} 使用图片背景承载标题`)
      assert.equal(await navIcon.count(), 1, `${section} 导航有图标`)
      if (titleIconRequired) {
        assert.equal(await titleIcon.locator('path, circle, rect').count() > 0, true)
        assert.equal(await titleIcon.getAttribute('stroke'), 'currentColor', `${name} 随主题变色`)
        assert.equal(await titleIcon.getAttribute('aria-hidden'), 'true')
        assert.equal(await navIcon.innerHTML(), await titleIcon.innerHTML(), `${name} 两处使用相同造型`)
      }
    }
    for (const label of ['金币与风格', '数据与设置']) {
      assert.equal(await navigation.getByRole('button', { name: label }).locator('svg').count(), 1)
    }
    assert.equal(await page.locator('.brand-icon svg').count(), 1)
    assert.equal(await page.locator('.coin-icon svg').count(), 1)
    assert.equal(await page.getByRole('button', { name: '设置壁纸' }).locator('svg').count(), 1)
    assert.equal(await page.getByRole('button', { name: /余额 .*￥/ }).count(), 1)

    await page.evaluate(() => { document.documentElement.dataset.theme = 'focus' })
    assert.equal(await page.locator('.home-plan .home-heading-icon').evaluate(el => getComputedStyle(el).color),
      'rgb(148, 201, 170)')
    await navigation.getByRole('button', { name: '饮食计划' }).click()
    assert.equal(await page.locator('#main-content h1').innerText(), '饮食计划')
    await page.getByRole('button', { name: '闹之钟，返回首页总览' }).click()
    assert.equal(await page.locator('#main-content h1').innerText(), '首页总览')
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  } finally {
    await browser?.close()
    server.kill()
  }
})

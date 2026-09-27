import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const lifePages = ['备忘录', '饮食计划', '游戏娱乐', '羽毛球']

test('今日计划与四个生活日历分别保存自己的界面设置并持久化', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage18-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        if ((await fetch(origin)).ok) break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 80))
      }
    }
    browser = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true })
    const page = browser.pages()[0] || await browser.newPage()
    await page.goto(origin)

    const openPage = async (name, selector = '.life-calendar-page') => {
      await page.getByRole('navigation').getByRole('button', { name }).click()
      await page.locator(selector).waitFor()
    }

    const openSettings = async () => {
      await page.locator('.tasks-settings-button').click()
      const settings = page.locator('.task-settings-dialog')
      await settings.waitFor()
      return settings
    }

    await openPage('今日计划', '.tasks-page')
    let settings = await openSettings()
    assert.equal(await settings.getByRole('slider', { name: '宽度' }).getAttribute('min'), '760')
    assert.equal(await settings.getByRole('slider', { name: '宽度' }).getAttribute('max'), '1300')
    await settings.getByRole('slider', { name: '宽度' }).fill('850')
    await settings.getByRole('button', { name: '完成' }).click()

    await openPage('备忘录')
    settings = await openSettings()
    assert.equal(await settings.getByRole('slider', { name: '宽度' }).inputValue(), '1120')
    await settings.getByRole('slider', { name: '宽度' }).fill('900')
    await settings.getByRole('slider', { name: '整体缩放' }).fill('110')
    await settings.getByRole('slider', { name: '透明度' }).fill('60')
    await settings.getByRole('slider', { name: '毛玻璃' }).fill('42')
    await settings.getByRole('button', { name: '暗色字' }).click()
    await settings.getByRole('checkbox', { name: '月视图日期下列出任务' }).uncheck()
    await settings.getByRole('button', { name: '完成' }).click()

    await page.locator('.life-calendar-page.tasks-text-dark.life-calendar-hide-month-items').waitFor()
    let style = await page.locator('.life-calendar-page').getAttribute('style')
    assert.match(style, /--task-calendar-width:\s*900px/)
    assert.match(style, /--task-calendar-scale:\s*1\.1/)
    assert.match(style, /--task-calendar-opacity:\s*0\.6/)
    assert.match(style, /--task-calendar-blur:\s*42px/)

    await openPage('今日计划', '.tasks-page')
    settings = await openSettings()
    assert.equal(await settings.getByRole('slider', { name: '宽度' }).inputValue(), '850')
    await settings.getByRole('button', { name: '完成' }).click()

    await openPage('饮食计划')
    settings = await openSettings()
    assert.equal(await settings.getByRole('slider', { name: '宽度' }).inputValue(), '1120')
    await settings.getByRole('slider', { name: '宽度' }).fill('980')
    await settings.getByRole('button', { name: '完成' }).click()

    await openPage('备忘录')
    settings = await openSettings()
    assert.equal(await settings.getByRole('slider', { name: '宽度' }).inputValue(), '900')
    assert.equal(await settings.getByRole('slider', { name: '透明度' }).inputValue(), '60')
    await settings.getByRole('button', { name: '完成' }).click()

    for (const name of lifePages.slice(2)) {
      await openPage(name)
      settings = await openSettings()
      assert.equal(await settings.getByRole('slider', { name: '宽度' }).inputValue(), '1120')
      await settings.getByRole('button', { name: '完成' }).click()
    }

    await page.reload()
    await openPage('备忘录')
    await page.locator('.tasks-settings-button').click()
    settings = page.locator('.task-settings-dialog')
    await settings.waitFor()
    assert.equal(await settings.getByRole('slider', { name: '宽度' }).inputValue(), '900')
    await settings.getByRole('button', { name: '完成' }).click()

    await openPage('饮食计划')
    style = await page.locator('.life-calendar-page').getAttribute('style')
    assert.match(style, /--task-calendar-width:\s*980px/)
  } finally {
    await browser?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const labels = {
  tasks: '\u4eca\u65e5\u8ba1\u5212',
  memo: '\u5907\u5fd8\u5f55',
  width: '\u5bbd\u5ea6',
  textSize: '\u6587\u5b57\u5927\u5c0f',
  light: '\u4eae\u8272\u5b57',
  dark: '\u6697\u8272\u5b57',
  warm: '\u6696\u91d1\u5b57',
  cool: '\u51b7\u84dd\u5b57',
  done: '\u5b8c\u6210',
}

test('calendar pages provide four independent text colors and text size settings', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage19-'))
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

    const openPage = async name => {
      await page.getByRole('navigation').getByRole('button', { name }).click()
      await page.locator('.tasks-page').waitFor()
    }
    const openSettings = async () => {
      await page.locator('.tasks-settings-button').click()
      const dialog = page.locator('.task-settings-dialog')
      await dialog.waitFor()
      return dialog
    }

    await openPage(labels.tasks)
    let settings = await openSettings()
    assert.equal(await settings.getByRole('button', { name: labels.light }).count(), 1)
    assert.equal(await settings.getByRole('button', { name: labels.dark }).count(), 1)
    assert.equal(await settings.getByRole('button', { name: labels.warm }).count(), 1)
    assert.equal(await settings.getByRole('button', { name: labels.cool }).count(), 1)
    const textSize = settings.getByRole('slider', { name: labels.textSize })
    assert.equal(await textSize.getAttribute('min'), '80')
    assert.equal(await textSize.getAttribute('max'), '130')
    await textSize.fill('115')
    await settings.getByRole('button', { name: labels.warm }).click()
    await page.locator('.tasks-page.tasks-text-warm').waitFor()
    assert.match(await page.locator('.tasks-page').getAttribute('style'), /--task-calendar-text-scale:\s*1\.15/)
    const normalFontSize = await page.locator('.tasks-calendar-title h2').evaluate(element => getComputedStyle(element).fontSize)
    await textSize.fill('130')
    const largeFontSize = await page.locator('.tasks-calendar-title h2').evaluate(element => getComputedStyle(element).fontSize)
    assert.notEqual(largeFontSize, normalFontSize)
    await settings.getByRole('button', { name: labels.done }).click()

    await openPage(labels.memo)
    settings = await openSettings()
    assert.equal(await settings.getByRole('slider', { name: labels.textSize }).inputValue(), '100')
    assert.equal(await settings.getByRole('button', { name: labels.light }).getAttribute('class'), 'active')
    await settings.getByRole('slider', { name: labels.textSize }).fill('125')
    await settings.getByRole('button', { name: labels.cool }).click()
    await page.locator('.tasks-page.tasks-text-cool').waitFor()
    await settings.getByRole('button', { name: labels.done }).click()

    await openPage(labels.tasks)
    settings = await openSettings()
    assert.equal(await settings.getByRole('slider', { name: labels.textSize }).inputValue(), '130')
    assert.equal(await settings.getByRole('button', { name: labels.warm }).getAttribute('class'), 'active')
    await settings.getByRole('button', { name: labels.done }).click()
  } finally {
    await browser?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

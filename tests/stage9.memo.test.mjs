import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'

test('备忘录进入左侧导航并按日期保存、查看每天记录', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage9-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let context
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(origin)
    await page.getByRole('navigation').getByRole('button', { name: '备忘录' }).click()
    await page.getByLabel('备忘日期').fill('2026-09-23')
    await page.locator('#memo-editor').fill('周三完成复盘')
    await page.getByRole('button', { name: '保存备忘' }).click()
    await page.getByRole('status').getByText('备忘已保存到本机').waitFor()
    await page.getByLabel('备忘日期').fill('2026-09-24')
    await page.locator('#memo-editor').fill('周四准备训练')
    await page.getByRole('button', { name: '保存备忘' }).click()
    await page.getByRole('button', { name: /2026-09-23/ }).waitFor()
    await page.getByText('周三完成复盘').waitFor()
    await page.getByRole('button', { name: /2026-09-24/ }).waitFor()
    await page.getByRole('button', { name: /周四准备训练/ }).waitFor()
    await page.getByRole('button', { name: /2026-09-23/ }).click()
    await page.waitForFunction(() => document.querySelector('#memo-editor')?.value === '周三完成复盘')
    assert.equal(await page.locator('#memo-editor').inputValue(), '周三完成复盘')
    await page.getByRole('navigation').getByRole('button', { name: '首页总览' }).click()
    assert.equal(await page.locator('h2').filter({ hasText: '备忘录' }).count(), 1)
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

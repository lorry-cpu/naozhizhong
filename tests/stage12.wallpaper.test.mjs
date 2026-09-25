import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const origin = 'http://127.0.0.1:8765'
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

test('总览支持导入本地壁纸、调整不透明度并在刷新后保留', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage12-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let context
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(origin)).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(origin)
    await page.locator('#overview-wallpaper-file').setInputFiles({
      name: 'wallpaper.png', mimeType: 'image/png', buffer: tinyPng,
    })
    await page.getByText('壁纸已保存到本机').waitFor()
    await page.getByLabel(/不透明度/).fill('65')
    await page.getByText('壁纸不透明度已保存：65%').waitFor()
    assert.equal(await page.locator('.overview-page').evaluate(element => getComputedStyle(element, '::before').backgroundImage.includes('data:image/png')), true)
    assert.equal(await page.locator('.overview-page').evaluate(element => getComputedStyle(element, '::before').opacity), '0.65')
    await page.reload()
    await page.getByText('已使用本地壁纸').waitFor()
    assert.equal(await page.getByLabel(/不透明度/).inputValue(), '65')
    assert.equal(await page.locator('.overview-page').evaluate(element => getComputedStyle(element, '::before').opacity), '0.65')
    await page.getByRole('button', { name: '清除壁纸' }).click()
    await page.getByText('壁纸已清除').waitFor()
    assert.equal(await page.getByText('已使用本地壁纸').count(), 0)
    assert.equal(await page.locator('.overview-page').evaluate(element => getComputedStyle(element, '::before').backgroundImage), 'none')
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

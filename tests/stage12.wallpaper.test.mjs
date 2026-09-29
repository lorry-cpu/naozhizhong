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

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(origin)).ok) return } catch { await new Promise(resolve => setTimeout(resolve, 75)) }
  }
  throw new Error('本地服务未启动')
}

async function wallpaperState(page) {
  return page.locator('.app-shell').evaluate(element => {
    const styles = getComputedStyle(element, '::before')
    return { backgroundImage: styles.backgroundImage, opacity: styles.opacity }
  })
}

test('壁纸通过导航右侧弹窗设置，并覆盖导航栏和所有模块页面', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage12-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let context
  try {
    await waitForServer()
    context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(origin)
    assert.equal(await page.getByRole('button', { name: '设置壁纸' }).count(), 1)
    assert.equal(await page.getByText('总览壁纸', { exact: true }).count(), 0)
    await page.getByRole('button', { name: '设置壁纸' }).click()
    await page.getByRole('dialog', { name: '设置壁纸' }).waitFor()
    await page.locator('#wallpaper-file').setInputFiles({
      name: 'wallpaper.png', mimeType: 'image/png', buffer: tinyPng,
    })
    await page.getByRole('status').getByText('壁纸已保存到本机').waitFor()
    await page.getByLabel(/不透明度/).fill('65')
    await page.getByRole('status').getByText('壁纸不透明度已保存：65%').waitFor()
    const imported = await wallpaperState(page)
    assert.match(imported.backgroundImage, /data:image\/png/)
    assert.equal(imported.opacity, '0.65')
    await page.getByRole('button', { name: '完成' }).click()
    const topbarBackground = await page.locator('.topbar').evaluate(element => getComputedStyle(element).backgroundColor)
    assert.match(topbarBackground, /rgba\(/)

    for (const title of ['备忘录', '今日计划', '饮食计划', '游戏娱乐', '羽毛球', '数据与设置']) {
      await page.getByRole('navigation').getByRole('button', { name: title }).click()
      await page.getByRole('heading', { name: title }).waitFor()
      const state = await wallpaperState(page)
      assert.match(state.backgroundImage, /data:image\/png/, `${title} 页面应显示同一张壁纸`)
      assert.equal(state.opacity, '0.65')
    }

    await page.reload()
    await page.getByRole('button', { name: '设置壁纸' }).click()
    await page.getByRole('dialog', { name: '设置壁纸' }).waitFor()
    assert.equal(await page.getByLabel(/不透明度/).inputValue(), '65')
    await page.getByRole('button', { name: '清除壁纸' }).click()
    await page.getByRole('status').getByText('壁纸已清除').waitFor()
    assert.equal((await wallpaperState(page)).backgroundImage, 'none')
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

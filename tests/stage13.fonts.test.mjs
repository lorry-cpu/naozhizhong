import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'

async function loaded(page, family) {
  await page.waitForFunction(name => [...document.fonts].some(face => face.family === name && face.status === 'loaded'), family)
}

test('内置字体在无缓存且外网被阻断时加载，快速切换不混用字体，清缓存后仍可恢复', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  const exited = once(server, 'exit')
  let output = ''
  server.stdout.on('data', chunk => { output += chunk })
  server.stderr.on('data', chunk => { output += chunk })
  let browser
  let releaseArchive
  const archiveGate = new Promise(resolve => { releaseArchive = resolve })
  try {
    for (let i = 0; i < 60 && !output.includes('闹之钟已启动'); i++) {
      if (server.exitCode !== null) throw new Error(output)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.match(output, /闹之钟已启动/)
    browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const external = []
    let archiveRequests = 0
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) { external.push(url.href); return route.abort() }
      if (url.pathname === '/fonts/fonts.tar.gz') {
        archiveRequests++
        await archiveGate
      }
      await route.continue()
    })
    const page = await context.newPage()
    await page.goto(origin)
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    assert.deepEqual(await page.locator('#font-choice option').allInnerTexts(), ['思源宋体', '思源黑体'])
    assert.deepEqual(await page.locator('#theme-choice option').allInnerTexts(), ['温暖日常', '清爽冷调', '专注简约'])
    for (const option of await page.locator('#font-choice option').all()) assert.equal(await option.isDisabled(), false)
    // Switch while the default font's archive is still loading.
    await page.locator('#font-choice').selectOption('source-han-sans')
    releaseArchive()
    await loaded(page, 'NaoSourceHanSans')
    await loaded(page, 'NaoSourceHanSerif')
    assert.equal(archiveRequests, 1)
    const pixelsDiffer = await page.evaluate(() => {
      const pixels = family => {
        const canvas = document.createElement('canvas')
        canvas.width = 400; canvas.height = 100
        const ctx = canvas.getContext('2d')
        ctx.font = '400 36px ' + family
        ctx.fillText('闹之钟今日计划 ABC', 10, 60)
        return Array.from(ctx.getImageData(0, 0, 400, 100).data)
      }
      const serif = pixels('NaoSourceHanSerif')
      const sans = pixels('NaoSourceHanSans')
      const fallback = pixels('__MissingFont__')
      return [serif.some((x, i) => x !== sans[i]), serif.some((x, i) => x !== fallback[i]), sans.some((x, i) => x !== fallback[i])]
    })
    assert.deepEqual(pixelsDiffer, [true, true, true], '两款真实字体必须不同，且不能只是系统回退字体')
    await page.reload()
    await loaded(page, 'NaoSourceHanSans')
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    assert.equal(await page.locator('#font-choice').inputValue(), 'source-han-sans')
    assert.equal(archiveRequests, 1, '刷新使用缓存')
    await page.locator('#font-choice').selectOption('source-han-serif')
    await loaded(page, 'NaoSourceHanSerif')
    assert.equal(archiveRequests, 1, '切回字体使用缓存')
    await page.getByRole('button', { name: '清除字体缓存' }).click()
    await page.getByRole('status').getByText('字体缓存已清除；再次使用时会从本地字体包加载。').waitFor()
    await page.reload()
    await loaded(page, 'NaoSourceHanSerif')
    assert.equal(archiveRequests, 2, '清缓存后从内置包重新读取')
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    await page.locator('#theme-choice').selectOption('focus')
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'focus')
    await mkdir('verify-out', { recursive: true })
    await page.screenshot({ path: 'verify-out/bundled-fonts-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'verify-out/bundled-fonts-mobile.png', fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    assert.deepEqual(external, [], '应用不得访问外网')
  } finally {
    releaseArchive()
    await browser?.close()
    if (server.exitCode === null) server.kill()
    await exited
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, access, writeFile, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'

/**
 * 字体已从仓库移除（体积原因），改为运行时从 GitHub Releases 下载。
 * 又因为 GitHub Releases 不接受 .ttf 附件，下载的是单个 fonts.tar.gz。
 * 测试需要一份真实 ttf 才能验证「下载 → 解压 → 缓存 → 注册」链路：
 * 优先用本机 public/fonts 下现成的文件；没有就跳过相关断言。
 */
async function loadFontFixture() {
  const candidates = [
    path.join(process.cwd(), 'public', 'fonts', 'source-han-sans.ttf'),
    path.join(process.cwd(), 'dist', 'fonts', 'source-han-sans.ttf'),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return await readFile(candidate)
    } catch { /* 试下一个 */ }
  }
  return null
}

/**
 * 用真实字体字节造一个 fonts.tar.gz，形状与 scripts/pack-fonts.mjs 的产物一致：
 * 包内两个文件，文件名分别为 <id>.woff2。
 * 这里用 ttf 夹具顶替 woff2：浏览器只看 Blob 的 MIME 类型，
 * 而 FontFace 能同时接受 ttf 与 woff2，因此足以验证下载→解压→缓存→注册链路。
 */
async function buildFontArchive(fixture) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rhythm-fonts-archive-'))
  const src = path.join(dir, 'src')
  await mkdir(src, { recursive: true })
  await writeFile(path.join(src, 'source-han-sans.woff2'), fixture)
  await writeFile(path.join(src, 'source-han-serif.woff2'), fixture)
  const { execFileSync } = await import('node:child_process')
  const tarPath = path.join(dir, 'fonts.tar')
  execFileSync('tar', ['-cf', tarPath, '-C', src, 'source-han-sans.woff2', 'source-han-serif.woff2'], { stdio: 'pipe' })
  const archive = gzipSync(await readFile(tarPath), { level: 6 })
  await rm(dir, { recursive: true, force: true })
  return archive
}

async function records(page, table) {
  return page.evaluate(async tableName => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('personal-rhythm-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return new Promise((resolve, reject) => {
      const request = db.transaction(tableName).objectStore(tableName).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }, table)
}

// 金币机制已移除：字体不再需要购买，直接在设置页切换。
// 只保留两种开源字体（思源宋体 / 思源黑体）。
test('设置页可自由切换字体，字体按需下载并缓存', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage13-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  const fontFixture = await loadFontFixture()
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(origin)).ok) break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 80))
      }
    }
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
    })
    const page = context.pages()[0] || await context.newPage()
    // 拦截字体包下载：测试不应真的访问 GitHub。
    // 注意拦的是 fonts.tar.gz（GitHub 不接受 .ttf 附件，所以字体打成一个包）。
    const archive = fontFixture ? await buildFontArchive(fontFixture) : null
    await page.route('**/fonts.tar.gz', async route => {
      if (!archive) return route.abort()
      await route.fulfill({ status: 200, contentType: 'application/gzip', body: archive })
    })
    await page.goto(origin)
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    await page.getByRole('heading', { name: '数据与设置' }).waitFor()

    // 只有两种开源字体可选，且不带「未购买」之类的禁用状态。
    const options = await page.locator('#font-choice option').allInnerTexts()
    assert.deepEqual(options, ['思源宋体', '思源黑体'], '只提供两种开源字体')
    for (const option of await page.locator('#font-choice option').all()) {
      assert.equal(await option.isDisabled(), false, '字体都可直接选择，无需购买')
    }
    assert.deepEqual(
      await page.locator('#theme-choice option').allInnerTexts(),
      ['温暖日常', '清爽冷调', '专注简约'],
      '三种风格都可自由切换',
    )

    assert.equal(await page.evaluate(() => document.documentElement.dataset.font), 'source-han-serif')
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily.includes('NaoSourceHanSerif')),
      true,
    )
    // 字体不再打进构建产物，改为运行时注入 @font-face。
    // 注意：用 Playwright 的 request 直接问服务器，避开上面拦截 *.ttf 的路由。
    assert.equal(
      (await page.request.get(`${origin}/fonts/source-han-serif.ttf`)).ok(),
      false,
      '字体已移出构建产物',
    )
    assert.equal(
      await page.evaluate(() => [...document.styleSheets].some(sheet => {
        try { return [...sheet.cssRules].some(rule => rule.constructor.name === 'CSSFontFaceRule') } catch { return false }
      })),
      false,
      '构建产物中不含 @font-face',
    )

    // 切换到另一种字体：应保存设置并触发下载。
    await page.locator('#font-choice').selectOption('source-han-sans')
    await page.waitForFunction(() => document.documentElement.dataset.font === 'source-han-sans')
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily.includes('NaoSourceHanSans')),
      true,
    )
    assert.equal((await records(page, 'settings')).find(row => row.key === 'font')?.value, 'source-han-sans')
    if (fontFixture) {
      await page.waitForFunction(async () => {
        const db = await new Promise(resolve => { const r = indexedDB.open('personal-rhythm-v1'); r.onsuccess = () => resolve(r.result) })
        return await new Promise(resolve => {
          const r = db.transaction('fontBlobs').objectStore('fontBlobs').get('source-han-sans')
          r.onsuccess = () => resolve(Boolean(r.result && r.result.bytes > 0))
          r.onerror = () => resolve(false)
        })
      })
      const cached = await records(page, 'fontBlobs')
      assert.equal(cached.some(row => row.id === 'source-han-sans' && row.bytes > 0), true, '字体已缓存到本机')
      // 关键行为：一个压缩包含两款字体，下载一次就把它们都缓存下来，
      // 之后在设置页来回切换不应再次联网。
      assert.equal(
        cached.some(row => row.id === 'source-han-serif' && row.bytes > 0),
        true,
        '同一个包里的另一款字体也应一并缓存，避免切换时重复下载 41MB',
      )
    } else {
      console.log('跳过字体缓存断言：本机没有可用的 .ttf 夹具（字体已移出仓库）')
    }

    // 刷新后仍是所选字体。
    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.font === 'source-han-sans')
    await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
    assert.equal(await page.locator('#font-choice').inputValue(), 'source-han-sans')

    // 切回宋体：两款字体都已在缓存里，不应再发起任何字体包请求。
    if (fontFixture) {
      let archiveRequests = 0
      await page.route('**/fonts.tar.gz', async route => { archiveRequests++; await route.continue() })
      await page.locator('#font-choice').selectOption('source-han-serif')
      await page.waitForFunction(() => document.documentElement.dataset.font === 'source-han-serif')
      await page.waitForTimeout(400)
      assert.equal(archiveRequests, 0, '已缓存的字体不应重新下载字体包')
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily.includes('NaoSourceHanSerif')),
        true,
      )
    }

    // 切换风格同样自由，无需兑换。
    await page.locator('#theme-choice').selectOption('focus')
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'focus')

    // 不再有任何金币相关记录。
    const stores = await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r = indexedDB.open('personal-rhythm-v1'); r.onsuccess = () => resolve(r.result) })
      return [...db.objectStoreNames]
    })
    assert.equal(stores.includes('ledger'), false, '金币流水表已移除')
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

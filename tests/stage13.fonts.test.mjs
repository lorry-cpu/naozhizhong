import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'

/**
 * 字体已从仓库移除（15 个共约 194MB），改为运行时从 Releases 下载。
 * 测试需要一份真实 ttf 才能验证「下载 → 缓存 → 注册」链路：
 * 优先用本机 public/fonts 下的文件；没有就跳过相关断言。
 */
async function loadFontFixture() {
  const candidates = [
    path.join(process.cwd(), 'public', 'fonts', 'tianwangxing.ttf'),
    path.join(process.cwd(), 'dist', 'fonts', 'tianwangxing.ttf'),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return await readFile(candidate)
    } catch { /* 试下一个 */ }
  }
  return null
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

test('字体默认思源宋体，字体可预览、以 200 金币购买并持久化', async () => {
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
    await page.goto(origin)
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    await page.getByRole('heading', { name: '字体商店' }).waitFor()

    assert.equal(await page.locator('[data-testid^="font-card-"]').count(), 15)
    assert.equal(await page.locator('[data-testid="font-card-source-han-serif"] .font-preview').count(), 1)
    assert.equal(await page.locator('[data-testid="font-card-kaiti"]').innerText().then(text => /200 金币/.test(text)), true)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.font), 'source-han-serif')
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily.includes('NaoSourceHanSerif')), true)
    // 字体不再打进构建产物：/fonts/*.ttf 应已不可访问，
    // 字库改为运行时从 GitHub Releases 下载（见 src/domain/fonts.ts）。
    assert.equal(await page.evaluate(async () => (await fetch('/fonts/source-han-serif.ttf')).ok), false, '字体已移出构建产物')
    for (const id of ['chaozi', 'dunhuang', 'hefeng', 'yongzi', 'yange', 'shangshou', 'mengqingjiang', 'tianwangxing']) {
      assert.equal(await page.locator(`[data-testid="font-card-${id}"] .font-preview`).count(), 1)
    }
    // CSS 里不再有 @font-face，字体由运行时注入；
    // 下载失败时应回退到系统兜底字体而不是白屏。
    assert.equal(
      await page.evaluate(() => [...document.styleSheets].some(sheet => {
        try { return [...sheet.cssRules].some(rule => rule.constructor.name === 'CSSFontFaceRule') } catch { return false }
      })),
      false,
      '构建产物中不含 @font-face',
    )

    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('personal-rhythm-v1')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('ledger', 'readwrite')
        tx.objectStore('ledger').add({
          id: 'font-test-coins',
          sourceKey: 'font-test-coins',
          amount: 200,
          at: Date.now(),
          reason: '字体测试奖励',
        })
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    })
    await page.reload()
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    page.on('dialog', dialog => dialog.accept())
    // 购买会触发字体下载。测试不能真的访问 GitHub，所以拦截请求并回一个真实字体文件。
    // 字体已从仓库移除（体积原因），因此这里优先用本机 public/fonts 里现成的一个；
    // 若开发机上也没有字体文件，则跳过下载相关断言，避免测试依赖网络或大文件。
    await page.route('**/*.ttf', async route => {
      if (!fontFixture) return route.abort()
      await route.fulfill({ status: 200, contentType: 'font/ttf', body: fontFixture })
    })
    await page.locator('[data-testid="font-card-kaiti"]').getByRole('button', { name: '购买并使用' }).click()
    await page.waitForFunction(() => document.documentElement.dataset.font === 'kaiti')
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily.includes('NaoKaiTi')), true)
    assert.match(await page.locator('[data-testid="font-card-kaiti"]').innerText(), /使用中/)
    assert.equal((await records(page, 'ledger')).filter(entry => entry.reason.includes('购买字体')).length, 1)
    assert.equal((await records(page, 'settings')).find(row => row.key === 'font')?.value, 'kaiti')
    if (fontFixture) {
      // 下载的字体会缓存到本机（不进备份），刷新后无需重新联网。
      await page.waitForFunction(async () => {
        const db = await new Promise(resolve => { const r = indexedDB.open('personal-rhythm-v1'); r.onsuccess = () => resolve(r.result) })
        return await new Promise(resolve => {
          const r = db.transaction('fontBlobs').objectStore('fontBlobs').get('kaiti')
          r.onsuccess = () => resolve(Boolean(r.result && r.result.bytes > 0))
          r.onerror = () => resolve(false)
        })
      })
      const cached = await records(page, 'fontBlobs')
      assert.equal(cached.some(row => row.id === 'kaiti' && row.bytes > 0), true, '字体已缓存到本机')
    } else {
      console.log('跳过字体缓存断言：本机没有可用的 .ttf 夹具（字体已移出仓库）')
    }

    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.font === 'kaiti')
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    // 卡片里现在有两个 button（可点击的预览文字 + 购买/使用按钮），
    // 所以这里按名称定位，避免歧义。
    assert.match(await page.locator('[data-testid="font-card-kaiti"]').innerText(), /使用中/)
    assert.equal(await page.locator('[data-testid="font-card-kaiti"] .button-primary').isDisabled(), true)
    assert.equal((await records(page, 'ledger')).reduce((sum, entry) => sum + entry.amount, 0), 0)
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

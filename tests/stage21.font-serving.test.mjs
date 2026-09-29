import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, writeFile, mkdir, access, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { chromium } from 'playwright'

/**
 * 字体必须由**同源**的本机服务提供。
 *
 * 背景：曾经让浏览器直接 fetch GitHub Releases，结果是 100% 失败——
 * github.com 的下载地址不返回 CORS 头：
 *   "Access to fetch ... has been blocked by CORS policy:
 *    No 'Access-Control-Allow-Origin' header is present"
 * 用户只会看到回退的系统字体，而且下载进度一直不动。
 *
 * 这个测试守住两件事：
 *   1. 应用请求的字体地址必须是相对路径（同源），不能是跨域绝对地址；
 *   2. 本机服务能把 dist/fonts/fonts.tar.gz 正常提供出来。
 */
const origin = 'http://127.0.0.1:8765'

async function withServer(run) {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-fonts-src-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(origin)).ok) break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    return await run(profile)
  } finally {
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
}

/** 造一个真实的字体包放进 dist/fonts，模拟启动器已下载完成。 */
async function placeFontArchive(fixture) {
  const dir = path.join(process.cwd(), 'dist', 'fonts')
  await mkdir(dir, { recursive: true })
  const src = await mkdtemp(path.join(tmpdir(), 'rhythm-fa-'))
  await writeFile(path.join(src, 'source-han-sans.woff2'), fixture)
  await writeFile(path.join(src, 'source-han-serif.woff2'), fixture)
  const tarPath = path.join(src, 'fonts.tar')
  execFileSync('tar', ['-cf', tarPath, '-C', src, 'source-han-sans.woff2', 'source-han-serif.woff2'], { stdio: 'pipe' })
  const archive = gzipSync(await readFile(tarPath), { level: 6 })
  const target = path.join(dir, 'fonts.tar.gz')
  await writeFile(target, archive)
  await rm(src, { recursive: true, force: true })
  return target
}

async function loadFixture() {
  for (const candidate of [
    path.join(process.cwd(), 'public', 'fonts', 'source-han-sans.ttf'),
    path.join(process.cwd(), 'dist', 'fonts', 'source-han-sans.ttf'),
  ]) {
    try { await access(candidate); return await readFile(candidate) } catch { /* 下一个 */ }
  }
  return null
}

test('字体地址必须是同源相对路径，不能跨域直连 GitHub', async () => {
  const source = await readFile('src/domain/fonts.ts', 'utf8')
  // fontArchiveUrl() 必须返回以 / 开头的相对路径。
  assert.match(
    source,
    /return\s+`\/fonts\/\$\{FONT_ARCHIVE_NAME\}`/,
    'fontArchiveUrl 必须返回同源相对路径，否则浏览器会因 CORS 被拦截',
  )
  // 上游地址只能出现在启动器里，浏览器不应请求 github.com。
  const fn = source.slice(source.indexOf('export function fontArchiveUrl'))
  assert.equal(
    /https?:\/\//.test(fn.slice(0, fn.indexOf('}'))),
    false,
    'fontArchiveUrl 不应包含任何绝对 URL',
  )
})

test('应用实际请求的是同源字体路径，且本机服务能提供字体包', async () => {
  const fixture = await loadFixture()
  if (!fixture) {
    console.log('跳过：本机没有可用字体夹具')
    return
  }
  const archivePath = await placeFontArchive(fixture)
  try {
    await withServer(async profile => {
      const context = await chromium.launchPersistentContext(profile, {
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
      })
      try {
        const page = context.pages()[0] || await context.newPage()
        const fontRequests = []
        page.on('request', request => {
          const url = request.url()
          if (url.includes('fonts.tar.gz')) fontRequests.push(url)
        })

        await page.goto(origin)
        await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
        await page.getByRole('heading', { name: '数据与设置' }).waitFor()

        // 先切到宋体（默认值不触发下载），再切到黑体确保一定走下载分支。
        await page.locator('#font-choice').selectOption('source-han-sans')
        // 等字体包请求真的发出去，而不是只等 selectOption 返回。
        await page.waitForFunction(
          () => performance.getEntriesByType('resource').some(e => e.name.includes('fonts.tar.gz')),
          null,
          { timeout: 90000 },
        )

        // 等字体真正注册进 document.fonts 并加载完成。
        // 只等 IndexedDB 落库不够：注册发生在解压之后，可能有时间差。
        await page.waitForFunction(async () => {
          const faces = [...document.fonts].filter(f => f.family.startsWith('Nao'))
          if (faces.length === 0) return false
          const db = await new Promise(resolve => {
            const r = indexedDB.open('personal-rhythm-v1')
            r.onsuccess = () => resolve(r.result)
          })
          const rows = await new Promise(resolve => {
            const req = db.transaction('fontBlobs').objectStore('fontBlobs').getAll()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve([])
          })
          return rows.length >= 2 && rows.every(row => row.bytes > 0)
        }, null, { timeout: 90000 })

        // 关键断言 1：请求的是本机同源地址，不是 github.com
        assert.ok(fontRequests.length > 0, '应当发起过字体包请求')
        for (const url of fontRequests) {
          assert.equal(
            url.startsWith(origin),
            true,
            `字体包必须从本机同源地址请求，实际是 ${url}（跨域会被 CORS 拦截）`,
          )
        }

        // 关键断言 2：字体真的注册并生效。
        // 不用"墨迹像素数"判断：实测 sans-serif / monospace / 不存在的字体
        // 在这个画布上都得到相同的像素数，无法区分。
        // 改为逐像素比对两张画布的原始数据，并确认用的是已加载字体。
        const applied = await page.evaluate(async () => {
          // 等浏览器把已注册的 FontFace 真正加载完。
          await document.fonts.ready
          const faces = [...document.fonts].filter(f => f.family.startsWith('Nao'))
          const pixels = spec => {
            const c = document.createElement('canvas')
            c.width = 240; c.height = 70
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 240, 70)
            ctx.fillStyle = '#000'; ctx.font = spec
            ctx.fillText('闹之钟今日', 4, 48)
            return Array.from(ctx.getImageData(0, 0, 240, 70).data)
          }
          const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
          const withDownloaded = pixels('400 36px NaoSourceHanSans')
          const withMissing = pixels('400 36px __DefinitelyNotAFont__')
          return {
            faces: faces.map(f => ({ family: f.family, status: f.status })),
            differsFromFallback: !same(withDownloaded, withMissing),
            loadedFamilies: faces.filter(f => f.status === 'loaded').map(f => f.family),
          }
        })
        const diag = await page.evaluate(async () => {
          const db = await new Promise(resolve => {
            const r = indexedDB.open('personal-rhythm-v1')
            r.onsuccess = () => resolve(r.result)
          })
          const rows = await new Promise(resolve => {
            const req = db.transaction('fontBlobs').objectStore('fontBlobs').getAll()
            req.onsuccess = () => resolve(req.result.map(x => ({ id: x.id, bytes: x.bytes })))
            req.onerror = () => resolve([])
          })
          return {
            faces: [...document.fonts].map(f => ({ family: f.family, status: f.status })),
            cached: rows,
            dataFont: document.documentElement.dataset.font,
          }
        })
        assert.ok(
          diag.faces.length > 0,
          `字体应已注册为 FontFace。诊断：faces=${JSON.stringify(diag.faces)} ` +
          `cached=${JSON.stringify(diag.cached)} dataFont=${diag.dataFont} ` +
          `字体包请求=${JSON.stringify(fontRequests)}`,
        )
        assert.ok(applied.loadedFamilies.length > 0, '字体应加载完成')
        assert.ok(
          applied.differsFromFallback,
          '下载的字体与兜底字体渲染完全一致，说明字体没有真正生效',
        )
      } finally {
        await context.close()
      }
    })
  } finally {
    await rm(archivePath, { force: true })
  }
})

test('启动器能在本机缓存字体包，供同源请求使用', async () => {
  // 校验 launcher/fonts.cjs 的两个关键行为：已有缓存则不重复下载；
  // 下载失败不抛异常（应用要继续可用）。
  const module = await import('../launcher/fonts.cjs')
  assert.equal(typeof module.ensureFontArchive, 'function')

  const dir = await mkdtemp(path.join(tmpdir(), 'rhythm-launcher-fonts-'))
  try {
    const dest = path.join(dir, 'fonts.tar.gz')
    // 放一个足够大的假缓存，确认走 "cached" 分支且不联网。
    await writeFile(dest, Buffer.alloc(module.MIN_BYTES, 1))
    const outcome = await module.ensureFontArchive(dest, 'https://127.0.0.1:1/never', () => {})
    assert.equal(outcome, 'cached')
    assert.equal((await stat(dest)).size, module.MIN_BYTES)

    // 无效地址时返回 'failed' 而不是抛错。
    const dest2 = path.join(dir, 'missing.tar.gz')
    const failed = await module.ensureFontArchive(dest2, 'https://127.0.0.1:1/nope', () => {})
    assert.equal(failed, 'failed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

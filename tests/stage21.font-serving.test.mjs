import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, readFile, cp, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { extractFontsFromArchive } from '../src/domain/archive.ts'
import { fontArchiveUrl } from '../src/domain/fonts.ts'

const origin = 'http://127.0.0.1:8765'

test('内置包包含两款真实 WOFF2 字体和版权许可，构建前后内容一致', async () => {
  assert.equal(fontArchiveUrl(), '/fonts/fonts.tar.gz')
  const archive = await readFile('public/fonts/fonts.tar.gz')
  assert.ok(archive.length > 1000000 && archive.length < 25 * 1000 * 1000)
  assert.deepEqual(await readFile('dist/fonts/fonts.tar.gz'), archive)
  const fonts = await extractFontsFromArchive(new Uint8Array(archive), 'gzip')
  assert.deepEqual([...fonts.keys()].sort(), ['source-han-sans', 'source-han-serif'])
  for (const font of fonts.values()) {
    assert.equal(new TextDecoder().decode(font.data.slice(0, 4)), 'wOF2')
    assert.equal(font.mimeType, 'font/woff2')
  }
  assert.match(await readFile('public/fonts/OFL.txt', 'utf8'), /SIL OPEN FONT LICENSE Version 1.1/)
  assert.match(await readFile('public/fonts/NOTICE.txt', 'utf8'), /Adobe/)
  assert.deepEqual((await readdir('dist/fonts')).sort(), ['NOTICE.txt', 'OFL.txt', 'fonts.tar.gz'])
})

for (const built of [false, true]) {
  test(built ? '只有构建目录和启动器时字体也可离线加载' : '模拟下载 ZIP：无依赖、无构建字体缓存时可直接离线启动', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'naozhizhong-bundled-'))
    let server, exited, browser
    let output = ''
    try {
      await mkdir(path.join(dir, 'launcher'))
      for (const name of ['serve.cjs', 'open-browser.cjs']) await cp(path.join('launcher', name), path.join(dir, 'launcher', name))
      await cp('dist', path.join(dir, 'dist'), { recursive: true, filter: source => built || path.relative('dist', source).split(path.sep)[0] !== 'fonts' })
      if (!built) {
        await mkdir(path.join(dir, 'public', 'fonts'), { recursive: true })
        for (const name of ['fonts.tar.gz', 'OFL.txt', 'NOTICE.txt']) await cp(path.join('public', 'fonts', name), path.join(dir, 'public', 'fonts', name))
      }
      const guard = path.resolve('tests/fixtures/no-external-network.cjs')
      server = spawn(process.execPath, ['--require', guard, path.join(dir, 'launcher', 'serve.cjs'), '--no-open'], { cwd: dir })
      exited = once(server, 'exit')
      server.stdout.on('data', chunk => { output += chunk })
      server.stderr.on('data', chunk => { output += chunk })
      for (let i = 0; i < 60 && !output.includes('闹之钟已启动'); i++) {
        if (server.exitCode !== null) throw new Error(output)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      assert.match(output, /闹之钟已启动/)
      const response = await fetch(origin + fontArchiveUrl())
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'application/gzip')
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile('public/fonts/fonts.tar.gz'))
      assert.equal((await fetch(origin + '/fonts/OFL.txt')).status, 200)
      assert.equal((await fetch(origin + '/fonts/unknown.txt')).status, 404)
      browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
      const page = await browser.newPage()
      const external = []
      await page.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue()
        external.push(route.request().url())
        return route.abort()
      })
      await page.goto(origin)
      await page.waitForFunction(() => [...document.fonts].some(face => face.family === 'NaoSourceHanSerif' && face.status === 'loaded'))
      await page.getByRole('navigation').getByRole('button', { name: '数据与设置' }).click()
      await page.locator('#font-choice').selectOption('source-han-sans')
      await page.waitForFunction(() => [...document.fonts].some(face => face.family === 'NaoSourceHanSans' && face.status === 'loaded'))
      assert.deepEqual(external, [])
      assert.doesNotMatch(output, /正在下载|EXTERNAL_NETWORK_BLOCKED/)
    } finally {
      await browser?.close()
      if (server?.exitCode === null) server.kill()
      if (exited) await exited
      await rm(dir, { recursive: true, force: true })
    }
  })
}

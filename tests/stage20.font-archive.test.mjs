import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { extractFontsFromArchive, parseTar, decompress, TarError } from '../src/domain/archive.ts'

/**
 * 字体改为从 GitHub Releases 下载 fonts.tar.gz（GitHub 不接受 .ttf 附件），
 * 浏览器端必须自己解压。这里验证解压链路，用的是真实的 tar + gzip 产物，
 * 而不是手写的假数据，否则打包脚本和解压实现可能各自"自洽"却互不兼容。
 */

/** 用系统 tar 造一个真实归档，模拟 npm run fonts:pack 的产物。 */
async function makeArchive(files, { gzip = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rhythm-archive-'))
  const src = path.join(dir, 'src')
  await mkdir(src, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(src, name), content)
  }
  const tarPath = path.join(dir, 'fonts.tar')
  execFileSync('tar', ['-cf', tarPath, '-C', src, ...Object.keys(files).sort()], { stdio: 'pipe' })
  const tarBytes = await readFile(tarPath)
  return {
    dir,
    tarBytes: new Uint8Array(tarBytes),
    gzBytes: gzip ? new Uint8Array(gzipSync(tarBytes, { level: 9 })) : null,
  }
}

test('能从真实的 tar 产物里解析出文件内容', async () => {
  const payload = { 'source-han-serif.ttf': 'SERIF-BYTES', 'source-han-sans.ttf': 'SANS-BYTES' }
  const archive = await makeArchive(payload)
  try {
    const entries = parseTar(archive.tarBytes)
    assert.deepEqual(entries.map(entry => entry.base).sort(), ['source-han-sans.ttf', 'source-han-serif.ttf'])
    const serif = entries.find(entry => entry.base === 'source-han-serif.ttf')
    assert.equal(new TextDecoder().decode(serif.data), 'SERIF-BYTES')
  } finally {
    await rm(archive.dir, { recursive: true, force: true })
  }
})

test('解压 fonts.tar.gz 能得到按字体 id 索引的字节', async () => {
  const payload = { 'source-han-serif.ttf': 'SERIF-BYTES', 'source-han-sans.ttf': 'SANS-BYTES' }
  const archive = await makeArchive(payload)
  try {
    const fonts = await extractFontsFromArchive(archive.gzBytes, 'gzip')
    assert.deepEqual([...fonts.keys()].sort(), ['source-han-sans', 'source-han-serif'])
    assert.equal(new TextDecoder().decode(fonts.get('source-han-sans')), 'SANS-BYTES')
  } finally {
    await rm(archive.dir, { recursive: true, force: true })
  }
})

test('嵌套目录下的字体同样能被解析出来，非 .ttf 条目被忽略', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rhythm-archive-nested-'))
  try {
    const src = path.join(dir, 'fonts-v1')
    await mkdir(src, { recursive: true })
    await writeFile(path.join(src, 'source-han-serif.ttf'), 'NESTED')
    await writeFile(path.join(src, 'README.txt'), 'not a font')
    const tarPath = path.join(dir, 'nested.tar')
    execFileSync('tar', ['-cf', tarPath, '-C', dir, 'fonts-v1'], { stdio: 'pipe' })
    const tarBytes = new Uint8Array(await readFile(tarPath))

    // 目录前缀不影响识别；README.txt 被忽略。
    const entries = parseTar(tarBytes)
    assert.equal(entries.length, 2, 'tar 里有两个常规文件')
    assert.deepEqual(
      entries.filter(entry => entry.base.endsWith('.ttf')).map(entry => entry.base),
      ['source-han-serif.ttf'],
    )

    // 走完整链路：压成 gzip 后再解，结果一致。
    const fonts = await extractFontsFromArchive(new Uint8Array(gzipSync(tarBytes)), 'gzip')
    assert.deepEqual([...fonts.keys()], ['source-han-serif'])
    assert.equal(new TextDecoder().decode(fonts.get('source-han-serif')), 'NESTED')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('未压缩的数据当作 gzip 解开会失败，不会被误判成合法归档', async () => {
  const archive = await makeArchive({ 'source-han-serif.ttf': 'SERIF-BYTES' })
  try {
    await assert.rejects(
      () => extractFontsFromArchive(archive.tarBytes, 'gzip'),
      '裸 tar 以 gzip 解压必须报错，否则说明校验形同虚设',
    )
  } finally {
    await rm(archive.dir, { recursive: true, force: true })
  }
})

test('损坏的归档会明确报错，而不是悄悄返回空结果', async () => {
  const payload = { 'source-han-serif.ttf': 'SERIF-BYTES'.repeat(20) }
  const archive = await makeArchive(payload)
  try {
    // 1) 篡改头部的大小字段：tar 的校验和覆盖整个头部，因此必须被检出。
    const badHeader = archive.tarBytes.slice()
    badHeader[124] = '7'.charCodeAt(0)
    assert.throws(() => parseTar(badHeader), TarError, '头部被篡改时应当报错')

    // 2) 截断：数据区不完整时必须报错，而不是返回半截字体。
    const truncated = archive.tarBytes.slice(0, 800)
    assert.throws(() => parseTar(truncated), TarError, '归档被截断时应当报错')

    // 3) 完全不是 tar：给出可读错误（而不是返回空列表）。
    const garbage = new Uint8Array(1024).fill(0x41)
    assert.throws(() => parseTar(garbage), TarError, '非 tar 数据应当报错')

    // 4) 全 NUL：tar 用它表示归档结束，解析结果应为空而不是抛错。
    assert.deepEqual(parseTar(new Uint8Array(1024)), [])
  } finally {
    await rm(archive.dir, { recursive: true, force: true })
  }
})

test('头部校验和正确但数据被改写时，解压出来的字节忠实反映归档内容', async () => {
  // tar 的校验和只保护头部，不保护数据区；这里明确记录这一事实，
  // 避免以后误以为解析器会替我们校验字体字节的完整性。
  const archive = await makeArchive({ 'source-han-serif.ttf': 'ORIGINAL-BYTES' })
  try {
    const tampered = archive.tarBytes.slice()
    // 数据区从第 512 字节开始。
    tampered[512] = 'X'.charCodeAt(0)
    const entries = parseTar(tampered)
    assert.equal(entries.length, 1)
    assert.equal(new TextDecoder().decode(entries[0].data).startsWith('X'), true)
  } finally {
    await rm(archive.dir, { recursive: true, force: true })
  }
})

test('归档里没有 .ttf 时给出可读的错误', async () => {
  const archive = await makeArchive({ 'notes.txt': 'hello' })
  try {
    await assert.rejects(
      () => extractFontsFromArchive(archive.gzBytes, 'gzip'),
      /没有找到任何 \.ttf/,
    )
  } finally {
    await rm(archive.dir, { recursive: true, force: true })
  }
})

test('decompress 支持 gzip 与 deflate-raw 两种容器', async () => {
  const text = new TextEncoder().encode('闹之钟')
  const gz = new Uint8Array(gzipSync(text))
  assert.deepEqual(await decompress(gz, 'gzip'), text)
})

test('路径穿越的文件名会被拒绝', () => {
  // 手工造一个头部：名字为 ../evil.ttf，校验和按 GNU tar 规则算好。
  const name = '../evil.ttf'
  const block = new Uint8Array(512)
  const writeStr = (value, offset) => {
    for (let i = 0; i < value.length; i++) block[offset + i] = value.charCodeAt(i)
  }
  writeStr(name, 0)
  writeStr('00000000004', 124)   // size = 4
  writeStr('0000000', 136)       // mtime
  writeStr('        ', 148)      // 校验和先填空格
  writeStr('0', 156)
  writeStr('ustar\0', 257)
  writeStr('00', 263)
  let sum = 0
  for (const byte of block) sum += byte
  writeStr(sum.toString(8).padStart(6, '0') + '\0 ', 148)

  const data = new Uint8Array(512)
  data.set(new TextEncoder().encode('EVIL'), 0)
  const archive = new Uint8Array(1024)
  archive.set(block, 0)
  archive.set(data, 512)

  assert.deepEqual(parseTar(archive), [], '带 .. 的路径不应被当作字体文件读出')
})

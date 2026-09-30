// Maintainer tool: rebuild the bundled WOFF2 archive from local TTF sources.
// --check validates the distributed package without Python or source fonts.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fontsDir = path.join(root, 'public', 'fonts')
const outDir = path.join(root, 'release')
const archiveName = 'fonts.tar.gz'

// 与 src/domain/rules.ts 的 FONTS 对应；独立列出以便缺文件时指名道姓。
// 只保留开源字体（SIL OFL 1.1）：商业字体授权不允许公开分发，已移除。
const expected = ['source-han-serif', 'source-han-sans']

const checkOnly = process.argv.includes('--check')

/** 找一个能用的 Python（用来调 fontTools 转 woff2）。 */
function findPython() {
  const candidates = [
    process.env.PYTHON,
    // 本机打包运行时自带的 Python。
    'C:\\Users\\DELL\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe',
    'python',
    'python3',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-c', 'import fontTools, brotli'], { stdio: 'pipe' })
      return candidate
    } catch { /* 试下一个 */ }
  }
  return null
}

/** Convert only the two configured source fonts. */
async function convertFontsToWoff2(ids) {
  const python = findPython()
  if (!python) {
    throw new Error(
      '未找到带 fontTools + brotli 的 Python，无法生成 woff2。\n' +
      '安装：pip install fonttools brotli\n' +
      '（若已安装但不在 PATH，可用 PYTHON 环境变量指定解释器路径）',
    )
  }
  const woff2Dir = path.join(outDir, 'woff2')
  await mkdir(woff2Dir, { recursive: true })

  const script = `
import sys
from fontTools.ttLib import TTFont
for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    font = TTFont(src)
    font.flavor = 'woff2'
    font.save(dst)
`
  const args = []
  for (const id of ids) {
    args.push(path.join(fontsDir, `${id}.ttf`), path.join(woff2Dir, `${id}.woff2`))
  }
  execFileSync(python, ['-c', script, ...args], { stdio: 'inherit' })

  const results = []
  for (const id of ids) {
    const target = path.join(woff2Dir, `${id}.woff2`)
    results.push({ id, path: target, bytes: (await stat(target)).size })
  }
  return results
}

async function main() {
  if (checkOnly) {
    const bundled = path.join(fontsDir, archiveName)
    const bytes = (await stat(bundled)).size
    if (bytes <= 0 || bytes >= 25 * 1000 * 1000) throw new Error('内置字体包为空或超过项目的 25 MB 体积预算')
    const entries = execFileSync('tar', ['-tzf', bundled], { encoding: 'utf8' }).trim().split(/\r?\n/).sort()
    const wanted = expected.map(id => id + '.woff2').sort()
    if (JSON.stringify(entries) !== JSON.stringify(wanted)) throw new Error('内置包必须只包含两款预期的 WOFF2 字体')
    for (const name of ['OFL.txt', 'NOTICE.txt']) {
      if (!(await stat(path.join(fontsDir, name))).size) throw new Error('缺少字体许可：' + name)
    }
    console.log('内置字体包校验通过：' + (bytes / 1048576).toFixed(1) + ' MiB，包含两款字体及许可文件。')
    return
  }
  let names
  try {
    names = (await readdir(fontsDir)).filter(name => name.endsWith('.ttf'))
  } catch {
    console.error(`未找到字体目录：${fontsDir}`)
    console.error('更新内置字体时，请先把两款源 .ttf 放回 public/fonts/。')
    process.exitCode = 1
    return
  }

  const present = new Set(names)
  const missing = expected.filter(id => !present.has(`${id}.ttf`)).map(id => `${id}.ttf`)
  const extra = names.filter(name => !expected.includes(name.replace(/\.ttf$/, '')))

  console.log(`字体目录：${fontsDir}`)
  console.log(`找到 ${names.length} 个 .ttf；清单需要 ${expected.length} 个`)
  let total = 0
  for (const name of names) total += (await stat(path.join(fontsDir, name))).size
  console.log(`ttf 合计 ${(total / 1024 / 1024).toFixed(1)} MiB`)

  if (extra.length) console.warn(`清单外的源文件（不会打包）：${extra.join(', ')}`)
  if (missing.length) {
    console.error(`缺少：${missing.join(', ')}`)
    process.exitCode = 1
    return
  }
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const sorted = [...expected].filter(id => present.has(`${id}.ttf`)).sort()
  console.log('')
  console.log('转换为 woff2：')
  const converted = await convertFontsToWoff2(sorted)
  for (const item of converted) {
    console.log(`  ${item.id}.woff2  ${(item.bytes / 1024 / 1024).toFixed(2)} MiB`)
  }

  // 先打未压缩的 tar（包内是 woff2），再整体 gzip。
  // woff2 内部已经是 Brotli，所以外层 gzip 收益很小，但能保持
  // ".tar.gz" 这一种容器，浏览器端只需一种解压格式。
  const woff2Dir = path.join(outDir, 'woff2')
  const tarPath = path.join(outDir, 'fonts.tar')
  execFileSync('tar', ['-cf', tarPath, '-C', woff2Dir, ...converted.map(item => `${item.id}.woff2`)], { stdio: 'inherit' })

  // 用 Node 自带 zlib 压缩而不是 `tar -czf`：固定 mtime 之外，
  // 也让输出更可控、便于复现。
  const { gzipSync } = await import('node:zlib')
  const tarBytes = await readFile(tarPath)
  const gzBytes = gzipSync(tarBytes, { level: 9 })
  const target = path.join(outDir, archiveName)
  await writeFile(target, gzBytes)

  const size = (await stat(target)).size
  const hash = createHash('sha256').update(gzBytes).digest('hex')
  const limit = 25 * 1000 * 1000 // Project size budget, not a GitHub limit.
  if (size >= limit) throw new Error('字体包超过项目的 25 MB 体积预算：' + size)
  const bundledTarget = path.join(fontsDir, archiveName)
  await writeFile(bundledTarget, gzBytes)
  console.log('已更新内置字体包：' + bundledTarget)
  console.log('体积：' + (size / 1048576).toFixed(2) + ' MiB')
  console.log('sha256：' + hash)
  console.log('请核对 OFL.txt 和 NOTICE.txt，重新构建并测试，然后提交字体包、许可和构建结果。')
}

main().catch(error => { console.error(error); process.exitCode = 1 })

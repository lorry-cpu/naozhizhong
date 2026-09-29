// 把 public/fonts 下的字体打成 GitHub Releases 用的压缩包。
//
// 用法：
//   node scripts/pack-fonts.mjs           生成 release/fonts.tar.gz
//   node scripts/pack-fonts.mjs --check   只校验清单是否齐全，不生成文件
//
// 为什么字体不放在仓库里：
//   两个 ttf 合计约 41MB。一旦提交进 Git 历史就无法轻易移除，
//   别人 clone 时要下载全部体积，因此改为运行时按需下载。
//
// 为什么打成单个 .tar.gz 而不是逐个上传：
//   GitHub Releases 不接受 .ttf 后缀的附件。改成单个压缩包后
//   只需要上传 1 个附件。浏览器端用原生 DecompressionStream('gzip')
//   解压，见 src/domain/archive.ts。**不要改用 zip**：浏览器没有内置
//   zip 解压 API，会被迫引入第三方依赖。
//
// 为什么包内是 .woff2 而不是 .ttf：
//   ttf 直接 gzip 后约 25.6MiB，超过 GitHub Release 单文件 25MB 的上限。
//   woff2 是同一套字形的无损重打包（Brotli + 表变换），不删字形、
//   不删字重、观感完全一致，体积降到约 18MiB。
//   转换需要 Python 的 fontTools + brotli，见 convertFontsToWoff2()。
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

/**
 * 把 ttf 转成 woff2。失败时直接抛错而不是悄悄跳过：
 * 一旦退回 ttf，包会超过 GitHub 的 25MB 上限，发布照样会失败，
 * 提前报错比上传到一半才发现要好。
 */
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
  let names
  try {
    names = (await readdir(fontsDir)).filter(name => name.endsWith('.ttf'))
  } catch {
    console.error(`未找到字体目录：${fontsDir}`)
    console.error('字体已从仓库移除。请先把 .ttf 放回 public/fonts/ 再打包。')
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

  if (extra.length) console.warn(`清单外的文件（也会一起打包）：${extra.join(', ')}`)
  if (missing.length) {
    console.error(`缺少：${missing.join(', ')}`)
    process.exitCode = 1
    return
  }
  if (checkOnly) {
    console.log('校验通过（--check 模式，未生成文件）')
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
  const limit = 25 * 1000 * 1000  // GitHub 对 Release 单文件的上限（按十进制 MB 计）
  console.log('')
  console.log(`已生成 ${target}`)
  console.log(`  未压缩 tar：${(tarBytes.length / 1024 / 1024).toFixed(1)} MiB`)
  console.log(`  压缩后：${(size / 1024 / 1024).toFixed(2)} MiB`)
  console.log(`  sha256：${hash}`)
  if (size >= limit) {
    console.error('')
    console.error(`⚠ 仍超过 GitHub 的 25MB 上限（${size} bytes ≥ ${limit}），上传会被拒绝。`)
    process.exitCode = 1
    return
  }
  console.log(`  距离 25MB 上限还有 ${((limit - size) / 1024 / 1024).toFixed(2)} MiB 余量`)
  console.log('')
  console.log(`下一步：把 ${archiveName} 作为 Release 附件上传（tag 需为 fonts-v1）。`)
  console.log('附件文件名必须保持 fonts.tar.gz，运行时按 <FONT_BASE_URL>/fonts.tar.gz 下载。')
}

main().catch(error => { console.error(error); process.exitCode = 1 })

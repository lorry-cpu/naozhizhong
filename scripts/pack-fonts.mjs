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
// 为什么打成单个 .tar.gz 而不是逐个 .ttf 上传：
//   GitHub Releases 不接受 .ttf 后缀的附件。改成单个压缩包后
//   只需要上传 1 个附件（约 41MB），也远低于单文件 2GB 的上限。
//   浏览器端用原生 DecompressionStream('deflate-raw') 解压，
//   见 src/domain/archive.ts。**不要改用 zip**：浏览器没有内置
//   zip 解压 API，会被迫引入第三方依赖。
//
// 发布步骤：
//   1. 运行本脚本生成压缩包
//   2. 在 GitHub 建一个 tag 为 fonts-v1 的 Release（与 src/domain/fonts.ts 的
//      FONT_RELEASE_TAG 一致）
//   3. 把 release/fonts.tar.gz 作为 Release 附件上传
//      （文件名必须保持 fonts.tar.gz，运行时按 FONT_BASE_URL/fonts.tar.gz 取）
//   4. 确认 src/domain/fonts.ts 的 FONT_BASE_URL 已改成你的仓库地址
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, rm } from 'node:fs/promises'
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
  console.log(`合计 ${(total / 1024 / 1024).toFixed(1)} MB`)

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

  // 先打未压缩的 tar，再用 gzip 压成 .tar.gz。
  // tar 交给系统自带（Windows 10+ 与主流 Linux/macOS 都有），
  // 比自行拼 tar 结构可靠得多。
  const sorted = [...present].sort()
  const tarPath = path.join(outDir, 'fonts.tar')
  execFileSync('tar', ['-cf', tarPath, '-C', fontsDir, ...sorted], { stdio: 'inherit' })

  // 用 Node 自带 zlib 压缩而不是 `tar -czf`：可以固定 mtime，
  // 让同样的字体产出同样的 .tar.gz，方便核对校验和与复现构建。
  // gzip 容器开销约 18 字节，对 41MB 的包可以忽略。
  const { gzipSync } = await import('node:zlib')
  const tarBytes = await readFile(tarPath)
  const gzBytes = gzipSync(tarBytes, { level: 9 })
  const target = path.join(outDir, archiveName)
  const { writeFile } = await import('node:fs/promises')
  await writeFile(target, gzBytes)

  const size = (await stat(target)).size
  const hash = createHash('sha256').update(gzBytes).digest('hex')
  console.log('')
  console.log(`已生成 ${target}`)
  console.log(`  未压缩 tar：${(tarBytes.length / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  压缩后：${(size / 1024 / 1024).toFixed(1)} MB（压缩率 ${(100 - size / tarBytes.length * 100).toFixed(1)}%）`)
  console.log(`  sha256：${hash}`)
  console.log('')
  console.log(`下一步：把 ${archiveName} 作为 Release 附件上传（tag 需为 fonts-v1）。`)
  console.log('附件文件名必须保持 fonts.tar.gz，运行时按 <FONT_BASE_URL>/fonts.tar.gz 下载。')
}

main().catch(error => { console.error(error); process.exitCode = 1 })

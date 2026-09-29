// 把 public/fonts 下的字体打成 GitHub Releases 用的压缩包。
//
// 用法：
//   node scripts/pack-fonts.mjs           生成 release/fonts.tgz
//   node scripts/pack-fonts.mjs --check   只校验清单是否齐全，不生成文件
//
// 为什么字体不放在仓库里：
//   15 个 ttf 共约 194MB。一旦提交进 Git 历史就无法轻易移除，
//   别人 clone 时要下载全部体积，因此改为运行时按需下载。
//
// 发布步骤：
//   1. 运行本脚本生成压缩包
//   2. 在 GitHub 建一个 tag 为 fonts-v1 的 Release（与 src/domain/fonts.ts 的
//      FONT_RELEASE_TAG 一致）
//   3. 把包里 15 个 .ttf **逐个作为 Release 附件上传**（不要只传压缩包），
//      因为运行时按 <base>/<id>.ttf 直接取单个文件
//   4. 确认 src/domain/fonts.ts 的 FONT_BASE_URL 已改成你的仓库地址
import { execFileSync } from 'node:child_process'
import { mkdir, readdir, stat, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fontsDir = path.join(root, 'public', 'fonts')
const outDir = path.join(root, 'release')

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
  const target = path.join(outDir, 'fonts.tgz')
  // 交给系统自带的 tar（Windows 10+ 与主流 Linux/macOS 都有），
  // 比自行拼 zip 结构可靠得多。
  execFileSync('tar', ['-czf', target, '-C', fontsDir, ...[...present].sort()], { stdio: 'inherit' })
  const size = (await stat(target)).size
  console.log(`已生成 ${target}（${(size / 1024 / 1024).toFixed(1)} MB）`)
  console.log('')
  console.log('下一步：解压后把 15 个 .ttf 逐个上传为 GitHub Release 附件')
  console.log(`（Release 的 tag 需为 fonts-v1，与 src/domain/fonts.ts 保持一致）。`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })

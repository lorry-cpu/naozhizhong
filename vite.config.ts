import { defineConfig, type Plugin } from 'vite'
import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * 保留随仓库分发的压缩字体包，仅排除本机可能留存的源字体。
 */
function dropFontsFromBuild(): Plugin {
  return {
    name: 'naozhizhong-drop-fonts',
    apply: 'build',
    async buildStart() {
      const archive = await stat(path.join(rootDir, 'public/fonts/fonts.tar.gz')).catch(() => null)
      if (!archive?.isFile() || !archive.size) this.error('缺少内置字体包 public/fonts/fonts.tar.gz，请完整下载项目。')
    },
    async closeBundle() {
      const outDir = path.resolve(rootDir, 'dist')
      const found = await findFonts(outDir)
      if (!found.length) return
      for (const file of found) await rm(file, { force: true })
      // 清掉可能变空的字体目录
      for (const dir of new Set(found.map(file => path.dirname(file)))) {
        const rest = await readdir(dir).catch(() => ['x'])
        if (!rest.length) await rm(dir, { recursive: true, force: true })
      }
      console.log(`\n已移除 ${found.length} 个源字体文件，内置字体压缩包已保留。`)
    },
  }
}

/** 递归找出目录下所有 .ttf/.otf/.woff/.woff2。 */
async function findFonts(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const results: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...await findFonts(full))
    else if (/\.(ttf|otf|woff2?)$/i.test(entry.name)) results.push(full)
  }
  return results
}

export default defineConfig({
  plugins: [dropFontsFromBuild()],
})

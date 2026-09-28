import { defineConfig, type Plugin } from 'vite'
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * 字体共约 194MB，不进构建产物：应用改为运行时从 GitHub Releases
 * 按需下载（见 src/domain/fonts.ts 与 src/db/fonts.ts）。
 *
 * Vite 默认会把 public/ 整个复制到 dist/，所以开发机上若留着 public/fonts
 * 方便本地调试，构建产物又会变成 194MB。这个插件在构建结束后扫一遍产物，
 * 删除其中所有 .ttf，保证「构建产物不含字体」在任何机器上都成立，
 * 而不是依赖开发者记得手动清理。
 */
function dropFontsFromBuild(): Plugin {
  return {
    name: 'naozhizhong-drop-fonts',
    apply: 'build',
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
      console.log(`\n已从构建产物移除 ${found.length} 个字体文件（改为运行时按需下载）。`)
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

import { FONTS, type FontId } from './rules'

/**
 * 字体文件不进仓库（15 个文件共约 194 MB，会让 clone 变得非常慢）。
 * 改为首次使用时从 GitHub Releases 下载，并缓存到本机 IndexedDB。
 *
 * 发布新版本时：
 *   1. 用 `npm run fonts:pack` 生成 fonts.zip（见 scripts/pack-fonts.mjs）
 *   2. 把 zip 传到 GitHub Releases，标签固定为 FONT_RELEASE_TAG
 *   3. 改版本号时同步更新下面的 base 地址
 */
export const FONT_RELEASE_TAG = 'fonts-v1'
export const FONT_BASE_URL =
  `https://github.com/REPLACE_WITH_YOUR_NAME/naozhizhong/releases/download/${FONT_RELEASE_TAG}`

/** 每个字体的下载地址；文件名为 `<id>.ttf`，与打包脚本保持一致。 */
export function fontUrl(id: FontId): string {
  return `${FONT_BASE_URL}/${id}.ttf`
}

/** 默认字体（免费、开箱即用）；启动时会自动尝试下载以恢复原有观感。 */
export const defaultFontId: FontId = 'source-han-serif'

/** 所有需要下载的字体 id。 */
export const downloadableFontIds: ReadonlyArray<FontId> = FONTS.map(item => item.id)

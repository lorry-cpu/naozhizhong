import { FONTS, type FontId } from './rules'

/**
 * 字体文件不进仓库（15 个文件共约 194 MB，会让 clone 变得非常慢）。
 * 改为首次使用时从 GitHub Releases 下载，并缓存到本机 IndexedDB。
 *
 * 发布字体新版本时：
 *   1. `npm run fonts:check` 确认 public/fonts 下 15 个 .ttf 齐全
 *   2. `npm run fonts:pack` 生成 release/fonts.tgz
 *   3. 在 GitHub 建一个 tag 与 FONT_RELEASE_TAG 同名的 Release，
 *      把 15 个 .ttf **逐个**作为附件上传（运行时按 <base>/<id>.ttf 取单个文件）
 *   4. 换 tag 时同步更新下面的 FONT_RELEASE_TAG
 */
export const FONT_RELEASE_TAG = 'fonts-v1'
export const FONT_BASE_URL =
  `https://github.com/lorry-cpu/naozhizhong/releases/download/${FONT_RELEASE_TAG}`

/** 每个字体的下载地址；文件名为 `<id>.ttf`，与打包脚本保持一致。 */
export function fontUrl(id: FontId): string {
  return `${FONT_BASE_URL}/${id}.ttf`
}

/** 默认字体（免费、开箱即用）；启动时会自动尝试下载以恢复原有观感。 */
export const defaultFontId: FontId = 'source-han-serif'

/** 所有需要下载的字体 id。 */
export const downloadableFontIds: ReadonlyArray<FontId> = FONTS.map(item => item.id)

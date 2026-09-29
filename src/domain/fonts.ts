import { FONTS, type FontId } from './rules'

/**
 * 字体文件不进仓库（两个文件共约 41 MB，会让 clone 变得很慢）。
 * 改为首次使用时从 GitHub Releases 下载，并缓存到本机 IndexedDB。
 *
 * 为什么下载的是压缩包而不是单个 .ttf：
 *   GitHub Releases 不接受 .ttf 后缀的附件，因此字体统一打包成
 *   一个 fonts.tar.gz 上传；浏览器下载后用原生 DecompressionStream
 *   解压（见 src/domain/archive.ts）。
 *
 * 发布字体新版本时：
 *   1. `npm run fonts:check` 确认 public/fonts 下 2 个 .ttf 齐全
 *   2. `npm run fonts:pack` 生成 release/fonts.tar.gz
 *   3. 在 GitHub 建一个 tag 与 FONT_RELEASE_TAG 同名的 Release，
 *      把 fonts.tar.gz **作为单个附件上传**（文件名不要改）
 *   4. 换 tag 时同步更新下面的 FONT_RELEASE_TAG
 */
export const FONT_RELEASE_TAG = 'fonts-v1'
export const FONT_BASE_URL =
  `https://github.com/lorry-cpu/naozhizhong/releases/download/${FONT_RELEASE_TAG}`

/** 字体压缩包的文件名；与 scripts/pack-fonts.mjs 的 archiveName 保持一致。 */
export const FONT_ARCHIVE_NAME = 'fonts.tar.gz'

/** 字体压缩包的下载地址（整个包只下载一次，之后从本机缓存解压）。 */
export function fontArchiveUrl(): string {
  return `${FONT_BASE_URL}/${FONT_ARCHIVE_NAME}`
}

/** 默认字体（免费、开箱即用）；启动时会自动尝试下载以恢复原有观感。 */
export const defaultFontId: FontId = 'source-han-serif'

/** 所有需要下载的字体 id。 */
export const downloadableFontIds: ReadonlyArray<FontId> = FONTS.map(item => item.id)

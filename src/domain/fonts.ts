import { FONTS, type FontId } from './rules'

/**
 * 字体文件不进仓库（两个文件共约 41 MB，会让 clone 变得很慢）。
 * 运行时由本机启动器下载字体包，浏览器再从**同源**地址取用，
 * 解压后缓存到本机 IndexedDB。
 *
 * 为什么不直接在浏览器里 fetch GitHub Releases：
 *   github.com 的下载地址不返回 CORS 头，浏览器跨域 fetch 会被拦截
 *   （实测："blocked by CORS policy: No 'Access-Control-Allow-Origin'"）。
 *   因此改由 launcher/fonts.cjs 用 Node 下载到 dist/fonts/，
 *   浏览器只请求同源的 /fonts/fonts.tar.gz，既没有 CORS 问题，
 *   也能让不同浏览器共用同一份本机缓存。
 *
 * 为什么下载的是压缩包而不是单个字体：
 *   GitHub Releases 不接受 .ttf 后缀的附件，因此打包成一个
 *   fonts.tar.gz 上传（内含 woff2）；浏览器用原生 DecompressionStream
 *   解压（见 src/domain/archive.ts）。
 *
 * 发布字体新版本时：
 *   1. `npm run fonts:check` 确认 public/fonts 下 2 个 .ttf 齐全
 *   2. `npm run fonts:pack` 生成 release/fonts.tar.gz
 *   3. 在 GitHub 建一个 tag 与 FONT_RELEASE_TAG 同名的 Release，
 *      把 fonts.tar.gz 作为附件上传（文件名不要改）
 *   4. 换 tag 时同步更新下面的 FONT_RELEASE_TAG **以及
 *      launcher/fonts.cjs 里的 FONT_URL**
 */
export const FONT_RELEASE_TAG = 'fonts-v1'

/** 上游 Release 地址；仅由启动器（Node）使用，浏览器不直接访问。 */
export const FONT_UPSTREAM_URL =
  `https://github.com/lorry-cpu/naozhizhong/releases/download/${FONT_RELEASE_TAG}/fonts.tar.gz`

/** 字体压缩包的文件名；与 scripts/pack-fonts.mjs 的 archiveName 保持一致。 */
export const FONT_ARCHIVE_NAME = 'fonts.tar.gz'

/**
 * 浏览器实际请求的地址：本机启动器提供的同源静态文件。
 * 启动器未下好（或下载失败）时会返回 404，应用回退系统字体。
 */
export function fontArchiveUrl(): string {
  return `/fonts/${FONT_ARCHIVE_NAME}`
}

/** 默认字体（免费、开箱即用）；启动时会自动尝试下载以恢复原有观感。 */
export const defaultFontId: FontId = 'source-han-serif'

/** 所有需要下载的字体 id。 */
export const downloadableFontIds: ReadonlyArray<FontId> = FONTS.map(item => item.id)

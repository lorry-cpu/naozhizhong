/** 字体包随仓库分发，浏览器从本机服务读取并解压后缓存到 IndexedDB。 */

/** 字体压缩包的文件名；与 scripts/pack-fonts.mjs 的 archiveName 保持一致。 */
export const FONT_ARCHIVE_NAME = 'fonts.tar.gz'

/**
 * 浏览器实际请求的地址：随构建产物分发的同源静态文件。
 */
export function fontArchiveUrl(): string {
  return `/fonts/${FONT_ARCHIVE_NAME}`
}

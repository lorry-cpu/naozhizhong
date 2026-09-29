/**
 * 从 tar 归档里取出字体文件。
 *
 * 为什么需要这个模块：
 *   GitHub Releases 不接受 .ttf 附件，所以字体改为打包成 fonts.tar.gz 上传。
 *   浏览器下载后必须自己解压，而 archive 解压没有 npm 依赖可用
 *   （构建产物要尽量小，且本应用不引入运行时依赖），因此这里手写 tar 解析。
 *
 * 只依赖 deflate-raw 解压，交给浏览器原生的 DecompressionStream
 * （Chrome 80+ / Edge 80+ / Firefox 113+ / Safari 16.4+）。
 * 不支持该 API 的浏览器会明确报错，由调用方退回系统字体，而不是静默出错。
 *
 * 这里只解析 tar 的 512 字节头部，不做路径清洗以外的安全检查需求：
 * 我们只读取文件名，不落盘、不按路径写文件，因此不存在目录穿越风险
 * （但仍拒绝绝对路径与 .. 片段，避免误用）。
 */

/** tar 头部里我们关心的字段偏移。 */
const NAME_OFFSET = 0
const NAME_LENGTH = 100
const SIZE_OFFSET = 124
const SIZE_LENGTH = 12
const CHECKSUM_OFFSET = 148
const CHECKSUM_LENGTH = 8
const TYPE_OFFSET = 156
const PREFIX_OFFSET = 345
const PREFIX_LENGTH = 155
const MAGIC_OFFSET = 257
const BLOCK_SIZE = 512

/** 常规文件（旧的 '0' 与 NUL 都按常规文件处理）。 */
const TYPE_REGULAR = '0'
const TYPE_REGULAR_LEGACY = '\0'

export class TarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TarError'
  }
}

function readString(block: Uint8Array, offset: number, length: number): string {
  let end = offset
  const limit = offset + length
  while (end < limit && block[end] !== 0) end++
  return new TextDecoder().decode(block.subarray(offset, end))
}

/**
 * 解析八进制数字字段（可能以空格或 NUL 结尾）。
 * GNU tar 对超大文件会写 base-256，这里不支持并明确报错。
 */
function readOctal(block: Uint8Array, offset: number, length: number): number {
  if (block[offset] & 0x80) {
    throw new TarError('归档使用了 base-256 长度字段，暂不支持')
  }
  const text = readString(block, offset, length).trim()
  if (text === '') return 0
  if (!/^[0-7]+$/.test(text)) throw new TarError(`归档长度字段无效：${JSON.stringify(text)}`)
  return parseInt(text, 8)
}

/** 所有字节相加（无符号）计算校验和。 */
function computeChecksum(block: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < BLOCK_SIZE; i++) sum += block[i]
  return sum
}

/** 头部是否全为 NUL —— tar 用两个空块表示结束。 */
function isZeroBlock(block: Uint8Array): boolean {
  for (let i = 0; i < BLOCK_SIZE; i++) if (block[i] !== 0) return false
  return true
}

/**
 * 校验收和第 148 字节起到第 156 字节止在计算时按空格处理。
 * 这里把记录值也解析出来，避免把损坏的归档当成功。
 */
function readChecksum(block: Uint8Array): number {
  const raw = block.subarray(CHECKSUM_OFFSET, CHECKSUM_OFFSET + CHECKSUM_LENGTH)
  const text = new TextDecoder().decode(raw).replace(/[\0 ]/g, '')
  if (text === '') return 0
  if (!/^[0-7]+$/.test(text)) throw new TarError('归档校验和字段无效')
  return parseInt(text, 8)
}

function isUnsafeName(name: string): boolean {
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return true
  return name.split('/').some(part => part === '..')
}

export interface TarEntry {
  /** 归档内的完整路径，例如 "source-han-serif.ttf"。 */
  name: string
  /** 文件名部分。 */
  base: string
  data: Uint8Array
}

/**
 * 解析 tar 字节流，返回其中的常规文件。
 * 目录、符号链接等条目一律跳过。
 */
export function parseTar(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0

  while (true) {
    // 头部本身不完整 → 归档被截断。
    // 注意不能写成 `while (offset + BLOCK_SIZE <= bytes.length)`：
    // 那样会在截断时静默结束循环，把「文件损坏」当成「正常读完」。
    if (offset === bytes.length) break
    if (offset + BLOCK_SIZE > bytes.length) throw new TarError('归档已截断：文件头不完整')

    const header = bytes.subarray(offset, offset + BLOCK_SIZE)
    if (isZeroBlock(header)) break

    const size = readOctal(header, SIZE_OFFSET, SIZE_LENGTH)
    const expected = readChecksum(header)
    if (expected !== 0) {
      // 计算时把校验和所在字段整体当作空格。
      const stored = header.slice()
      stored.fill(0x20, CHECKSUM_OFFSET, CHECKSUM_OFFSET + CHECKSUM_LENGTH)
      if (computeChecksum(stored) !== expected) throw new TarError('归档校验和不匹配，文件可能已损坏')
    }

    const magic = readString(header, MAGIC_OFFSET, 6)
    if (magic !== 'ustar' && magic !== 'ustar\0' && magic.trim() !== 'ustar') {
      throw new TarError('不是可识别的 tar 归档')
    }

    const nameField = readString(header, NAME_OFFSET, NAME_LENGTH)
    const prefix = readString(header, PREFIX_OFFSET, PREFIX_LENGTH)
    const type = readString(header, TYPE_OFFSET, 1)
    const name = prefix ? `${prefix}/${nameField}` : nameField

    const dataStart = offset + BLOCK_SIZE
    const dataEnd = dataStart + size
    if (dataEnd > bytes.length) throw new TarError(`归档已截断：${name || '(未命名)'}`)

    const isRegular = type === TYPE_REGULAR || type === TYPE_REGULAR_LEGACY || type === ''
    if (isRegular && name && !isUnsafeName(name) && !name.endsWith('/')) {
      entries.push({
        name,
        base: name.split('/').pop() as string,
        data: bytes.subarray(dataStart, dataEnd),
      })
    }

    // 数据部分按 512 字节对齐。
    // 若对齐后超出长度，说明数据块尾部缺失，同样按截断处理
    // （除非恰好对齐到末尾，那是正常的结束位置）。
    const next = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
    if (next > bytes.length) throw new TarError(`归档已截断：${name || '(未命名)'} 的数据块不完整`)
    offset = next
  }

  return entries
}

/**
 * 解压 gzip / zlib / 裸 deflate 字节流。
 * format 默认 'gzip'；裸 deflate 用 'deflate-raw'（tar.gz 常见写法）。
 */
export async function decompress(
  bytes: Uint8Array,
  format: 'gzip' | 'deflate' | 'deflate-raw' = 'gzip',
): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new TarError('当前浏览器不支持解压字体包，请改用较新的 Chrome / Edge / Firefox / Safari')
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

/** 包内允许的字体扩展名。woff2 是发布用的格式（体积约为 ttf 的 45%）。 */
const FONT_EXTENSIONS = ['.woff2', '.ttf'] as const

/** 供 @font-face 使用的 MIME 类型。 */
export function fontMimeType(name: string): string {
  return name.endsWith('.woff2') ? 'font/woff2' : 'font/ttf'
}

/**
 * 一步解压 .tar.gz 并返回其中的字体条目。
 * 键是不带扩展名的字体 id，值同时保留字节与原始文件名，
 * 以便调用方设置正确的 MIME 类型（woff2 与 ttf 不同）。
 */
export interface ExtractedFont {
  id: string
  /** 归档内的原始文件名，例如 `source-han-serif.woff2`。 */
  fileName: string
  /** 供 Blob / @font-face 使用的 MIME 类型。 */
  mimeType: string
  data: Uint8Array
}

export async function extractFontsFromArchive(
  bytes: Uint8Array,
  format: 'gzip' | 'deflate' | 'deflate-raw' = 'gzip',
): Promise<Map<string, ExtractedFont>> {
  const tarBytes = await decompress(bytes, format)
  const result = new Map<string, ExtractedFont>()
  for (const entry of parseTar(tarBytes)) {
    const extension = FONT_EXTENSIONS.find(ext => entry.base.endsWith(ext))
    if (!extension) continue
    const id = entry.base.slice(0, -extension.length)
    result.set(id, {
      id,
      fileName: entry.base,
      mimeType: fontMimeType(entry.base),
      data: entry.data,
    })
  }
  if (result.size === 0) {
    throw new TarError('字体包里没有找到任何字体文件（.woff2 / .ttf）')
  }
  return result
}

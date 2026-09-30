import { FONTS, type FontId } from '../domain/rules'
import { FONT_ARCHIVE_NAME, fontArchiveUrl } from '../domain/fonts'
import { extractFontsFromArchive, type ExtractedFont } from '../domain/archive'
import { byId, openDatabase, requestValue, transactionDone } from './database'
import type { FontBlob } from './types'

/**
 * @font-face 里的 font-family 名称，与 app.css 中的 --app-font-family 对应。
 * 本地字体包解压后，@font-face 在运行时注入，
 * 因此这里必须与 CSS 里引用的名字保持一致。
 */
const familyNames: Record<FontId, string> = {
  'source-han-serif': 'NaoSourceHanSerif',
  'source-han-sans': 'NaoSourceHanSans',
}

/** 可变字重字体需要在 @font-face 里声明范围，与原来 CSS 中的写法一致。 */
const variableWeight: ReadonlySet<FontId> = new Set<FontId>(['source-han-sans', 'source-han-serif'])

/** 已在本页注册过的字体，避免重复注入。 */
const registered = new Set<FontId>()

/** 本页已解压出来的字体字节，避免同一会话里重复解压。 */
const unpacked = new Map<FontId, Blob>()

/** 合并并发加载；每个调用者按自己的字体 ID 注册，避免串用字节。 */
let inflight: Promise<void> | null = null

export function fontFamilyName(id: FontId): string {
  return familyNames[id]
}

async function readBlob(id: FontId): Promise<FontBlob | undefined> {
  return await byId('fontBlobs', id) as FontBlob | undefined
}

/**
 * 把本地字体字节注册成浏览器字体。
 * 用 Blob + URL.createObjectURL 而不是直接 url(...)：
 * 字体存本机，不应再依赖网络地址。
 */
function register(id: FontId, data: Blob): void {
  if (registered.has(id) || typeof document === 'undefined' || !document.fonts) return
  const url = URL.createObjectURL(data)
  const face = new FontFace(familyNames[id], `url(${url})`, {
    style: 'normal',
    display: 'swap',
    ...(variableWeight.has(id) ? { weight: '100 900' } : {}),
  })
  document.fonts.add(face)
  registered.add(id)
  // 加载完成后即可释放 URL；字体数据已由 FontFace 持有。
  void face.load().then(() => URL.revokeObjectURL(url)).catch(() => URL.revokeObjectURL(url))
}

/** 本机是否已有该字体的缓存。 */
export async function hasFont(id: FontId): Promise<boolean> {
  return Boolean(await readBlob(id))
}

/** 直接用本机缓存注册（不联网）。返回是否成功。 */
export async function useCachedFont(id: FontId): Promise<boolean> {
  const cached = unpacked.get(id)
  if (cached) {
    register(id, cached)
    return true
  }
  const row = await readBlob(id)
  if (!row) return false
  register(id, row.data)
  return true
}

/** 一次性把解压出来的字体写入缓存（单事务，只广播一次变更）。 */
async function cacheFonts(fonts: Map<string, ExtractedFont>): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('fontBlobs', 'readwrite')
  const done = transactionDone(tx)
  const store = tx.objectStore('fontBlobs')
  const now = Date.now()
  for (const [id, font] of fonts) {
    const blob = new Blob([font.data as BlobPart], { type: font.mimeType })
    store.put({ id, data: blob, bytes: blob.size, fetchedAt: now } as FontBlob)
  }
  await done
}

/**
 * 读取随项目提供的字体压缩包并解压出全部字体，写入 IndexedDB。
 * 一次读取后缓存两款字体，后续切换无需再次读取压缩包。
 */
async function loadAndUnpack(
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const response = await fetch(fontArchiveUrl())
  if (!response.ok) throw new Error(`本地字体包读取失败（HTTP ${response.status}）`)
  const total = Number(response.headers.get('content-length')) || 0
  let bytes: Uint8Array
  if (total > 0 && response.body) {
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      // 本地传输占 0～0.8，其余留给解压与缓存。
      onProgress?.(Math.min(0.8, received / total * 0.8))
    }
    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length }
    bytes = merged
  } else {
    bytes = new Uint8Array(await response.arrayBuffer())
  }

  onProgress?.(0.85)
  const fonts = await extractFontsFromArchive(bytes, 'gzip')
  onProgress?.(0.95)

  // 确认两款字体都存在后再更新缓存。
  for (const font of FONTS) {
    if (!fonts.has(font.id)) throw new Error(`字体包里没有找到 ${font.id}`)
  }
  for (const [id, font] of fonts) {
    const blob = new Blob([font.data as BlobPart], { type: font.mimeType })
    unpacked.set(id as FontId, blob)
  }

  // 缓存写入放在后面：即使写库失败，当前会话仍能正常显示字体。
  // 用一个事务写完全部字体：逐个 save() 会各自广播一次变更事件，
  // 让设置页和首页无谓地重载好几遍。
  await cacheFonts(fonts)
}

/** 读取字体并缓存、注册；已缓存时不会重复读取压缩包。 */
export async function ensureFont(id: FontId, onProgress?: (ratio: number) => void): Promise<void> {
  const cachedMem = unpacked.get(id)
  if (cachedMem) {
    register(id, cachedMem)
    return
  }
  const cachedRow = await readBlob(id)
  if (cachedRow) {
    unpacked.set(id, cachedRow.data)
    register(id, cachedRow.data)
    return
  }
  // 导入完成后写入。若导入失败必须清空，否则后续切换字体会一直拿到
  // 那个已拒绝的 Promise，永远无法重试读取。
  if (!inflight) {
    inflight = loadAndUnpack(onProgress).finally(() => { inflight = null })
  }
  await inflight
  const data = unpacked.get(id)
  if (!data) throw new Error(`字体包里没有找到 ${id}`)
  register(id, data)
}

/** 清除全部已缓存字体，用于设置页的“清理字体缓存”。 */
export async function clearFontCache(): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('fontBlobs', 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore('fontBlobs').clear()
  await done
  registered.clear()
  unpacked.clear()
}

/** 已缓存字体的总字节数，用于在设置页展示占用。 */
export async function fontCacheBytes(): Promise<number> {
  const db = await openDatabase()
  const rows = await requestValue(db.transaction('fontBlobs').objectStore('fontBlobs').getAll()) as FontBlob[]
  return rows.reduce((sum, row) => sum + (row.bytes || 0), 0)
}

export { FONTS, FONT_ARCHIVE_NAME }

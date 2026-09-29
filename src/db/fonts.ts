import { FONTS, type FontId } from '../domain/rules'
import { fontUrl } from '../domain/fonts'
import { byId, openDatabase, requestValue, save, transactionDone } from './database'
import type { FontBlob } from './types'

/**
 * @font-face 里的 font-family 名称，与 app.css 中的 --app-font-family 对应。
 * 字体文件改为运行时下载后，@font-face 也在运行时注入，
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

export function fontFamilyName(id: FontId): string {
  return familyNames[id]
}

async function readBlob(id: FontId): Promise<FontBlob | undefined> {
  return await byId('fontBlobs', id) as FontBlob | undefined
}

/**
 * 把已下载的字节注册成浏览器字体。
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
  const row = await readBlob(id)
  if (!row) return false
  register(id, row.data)
  return true
}

/** 下载字体并缓存、注册。已缓存时不会重复下载。 */
export async function ensureFont(id: FontId, onProgress?: (ratio: number) => void): Promise<void> {
  const cachedRow = await readBlob(id)
  if (cachedRow) {
    register(id, cachedRow.data)
    return
  }
  const response = await fetch(fontUrl(id))
  if (!response.ok) throw new Error(`字体下载失败（HTTP ${response.status}）`)
  const total = Number(response.headers.get('content-length')) || 0
  let data: Blob
  if (total > 0 && response.body && onProgress) {
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      onProgress(Math.min(1, received / total))
    }
    data = new Blob(chunks as BlobPart[], { type: 'font/ttf' })
  } else {
    data = await response.blob()
  }
  register(id, data)
  await save('fontBlobs', { id, data, bytes: data.size, fetchedAt: Date.now() } as FontBlob)
}

/** 清除全部已缓存字体，用于设置页的“清理字体缓存”。 */
export async function clearFontCache(): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('fontBlobs', 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore('fontBlobs').clear()
  await done
  registered.clear()
}

/** 已缓存字体的总字节数，用于在设置页展示占用。 */
export async function fontCacheBytes(): Promise<number> {
  const db = await openDatabase()
  const rows = await requestValue(db.transaction('fontBlobs').objectStore('fontBlobs').getAll()) as FontBlob[]
  return rows.reduce((sum, row) => sum + (row.bytes || 0), 0)
}

export { FONTS }

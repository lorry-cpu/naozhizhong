import type { Setting, TableName, Tables } from './types'

export const DB_NAME = 'personal-rhythm-v1'
export const DB_VERSION = 1
export const TABLES: TableName[] = ['templates', 'occurrences', 'timers', 'ledger', 'meals', 'entertainment', 'badminton', 'settings']
let cached: Promise<IDBDatabase> | null = null
const channel = typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('personal-rhythm-changes')

export function openDatabase(): Promise<IDBDatabase> {
  if (cached) return cached
  cached = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of TABLES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' })
      }
      const transaction = request.transaction!
      transaction.objectStore('occurrences').createIndex('date', 'date')
      transaction.objectStore('ledger').createIndex('sourceKey', 'sourceKey', { unique: true })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); cached = null }
      resolve(request.result)
    }
    request.onerror = () => { cached = null; reject(request.error) }
    request.onblocked = () => { cached = null; reject(new Error('数据库升级被其他页面阻止，请关闭旧页面后重试')) }
  })
  return cached
}

export function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('数据保存失败'))
    tx.onerror = () => reject(tx.error || new Error('数据保存失败'))
  })
}

export function announceChange() {
  channel?.postMessage('changed')
  window.dispatchEvent(new Event('app-data-changed'))
}
export function watchChanges(listener: () => void): () => void {
  const local = () => listener()
  const remote = () => listener()
  window.addEventListener('app-data-changed', local)
  channel?.addEventListener('message', remote)
  return () => {
    window.removeEventListener('app-data-changed', local)
    channel?.removeEventListener('message', remote)
  }
}

export async function all<K extends TableName>(name: K): Promise<Tables[K][]> {
  const db = await openDatabase()
  return requestValue(db.transaction(name).objectStore(name).getAll()) as Promise<Tables[K][]>
}
export async function byId<K extends TableName>(name: K, key: string): Promise<Tables[K] | undefined> {
  const db = await openDatabase()
  return requestValue(db.transaction(name).objectStore(name).get(key)) as Promise<Tables[K] | undefined>
}
export async function save<K extends TableName>(name: K, value: Tables[K]): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(name, 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore(name).put(value)
  await done
  announceChange()
}
export async function remove(name: TableName, key: string): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(name, 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore(name).delete(key)
  await done
  announceChange()
}
export async function setting(key: string): Promise<string | number | boolean | undefined> {
  return (await byId('settings', key))?.value
}
export async function saveSetting(key: string, value: Setting['value']): Promise<void> {
  await save('settings', { key, value })
}
export async function storageHealth(): Promise<{ writable: boolean; persistent: boolean; error?: string }> {
  try {
    const db = await openDatabase()
    const tx = db.transaction('settings', 'readwrite')
    const done = transactionDone(tx)
    tx.objectStore('settings').put({ key: 'storage-check', value: Date.now() })
    await done
    const persistent = await navigator.storage?.persist?.() ?? false
    return { writable: true, persistent }
  } catch (error) {
    return { writable: false, persistent: false, error: error instanceof Error ? error.message : String(error) }
  }
}

import { all, announceChange, openDatabase, requestValue, TABLES, transactionDone } from './database'
import type { Tables, TableName, TaskInstance } from './types'
import { FONTS, localMidnight } from '../domain/rules'
import { validateBadminton, validateEntertainment, validateMeal } from '../domain/life'
import { validateTask } from '../domain/tasks'

export type BackupData = { [K in TableName]: Tables[K][] }
/**
 * 备份格式版本。
 * v1：包含 ledger（金币流水）——金币机制已移除，不再支持导入。
 * v2：当前格式，任务只记录完成比例。
 */
export const BACKUP_VERSION = 2
export interface Backup { version: 2; exportedAt: string; data: BackupData }
export async function exportBackup(): Promise<Backup> {
  // A read transaction gives one coherent snapshot of every table.
  const db = await openDatabase()
  const tx = db.transaction(TABLES, 'readonly')
  const done = transactionDone(tx)
  const requests = TABLES.map(name => requestValue(tx.objectStore(name).getAll()))
  const values = await Promise.all(requests)
  await done
  const data = Object.fromEntries(TABLES.map((name, index) => [name, values[index]])) as BackupData
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份包含无效记录')
  return value as Record<string, unknown>
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }
function numeric(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function uniqueRows(records: unknown[], key: string) {
  const keys = new Set<string>()
  for (const value of records) {
    const row = object(value)
    if (!text(row[key]) || keys.has(row[key])) throw new Error(`备份中的 ${key} 缺失或重复`)
    keys.add(row[key])
  }
}
export function parseBackup(input: unknown): Backup {
  const root = object(input)
  if (root.version !== BACKUP_VERSION) {
    throw new Error(root.version === 1
      ? '这是旧版备份（含金币记录），当前版本已不再支持导入'
      : '备份版本或导出时间无效')
  }
  if (!text(root.exportedAt) || !numeric(Date.parse(root.exportedAt))) throw new Error('备份版本或导出时间无效')
  const raw = object(root.data)
  for (const name of TABLES) {
    if (!Array.isArray(raw[name]) || raw[name].length > 100000) throw new Error(`备份的 ${name} 表无效`)
    uniqueRows(raw[name], name === 'settings' ? 'key' : 'id')
  }
  const data = raw as unknown as BackupData
  for (const row of data.templates) {
    validateTask(row.title, row.startDate, row.time, row.minutes, row.difficulty, row.repeat)
    if (row.endDate !== null) localMidnight(row.endDate)
  }
  const templateIds = new Set(data.templates.map(row => row.id))
  const instances = new Map<string, TaskInstance>()
  const days = new Set<string>()
  for (const row of data.occurrences) {
    localMidnight(row.date)
    validateTask(row.title, row.date, row.time, row.minutes, row.difficulty, 'none')
    if (!templateIds.has(row.templateId)) throw new Error('备份包含没有模板的任务')
    const pair = `${row.templateId}@${row.date}`
    if (days.has(pair)) throw new Error('备份包含重复的每日任务')
    days.add(pair)
    if (!['pending', 'settled', 'cancelled'].includes(row.status)) throw new Error('任务状态无效')
    if (row.status === 'settled') {
      if (!numeric(row.settledAt) || typeof row.percentage !== 'number' || !Number.isSafeInteger(row.percentage) || row.percentage < 0 || row.percentage > 100) {
        throw new Error('任务结算记录无效')
      }
    } else if (row.percentage !== null || row.settledAt !== null) throw new Error('未结算任务包含结算数值')
    instances.set(row.id, row)
  }
  for (const timer of data.timers) {
    if (!instances.has(timer.id) || !numeric(timer.accumulatedMs) || timer.accumulatedMs < 0 ||
      (timer.startedAt !== null && !numeric(timer.startedAt))) throw new Error('计时记录无效')
  }
  for (const row of data.meals) validateMeal(row)
  for (const row of data.entertainment) validateEntertainment(row)
  for (const row of data.badminton) validateBadminton(row)
  for (const row of data.settings) {
    if (!text(row.key) || !['string','number','boolean'].includes(typeof row.value) ||
      (typeof row.value === 'number' && !numeric(row.value))) throw new Error('设置记录无效')
  }
  const chosen = data.settings.find(row => row.key === 'theme')?.value
  if (chosen && chosen !== 'warm' && data.settings.find(row => row.key === `unlocked:${chosen}`)?.value !== true) throw new Error('当前风格尚未兑换')
  const font = data.settings.find(row => row.key === 'font')?.value
  if (font && (typeof font !== 'string' || !FONTS.some(item => item.id === font))) {
    throw new Error('当前字体无效')
  }
  if (font && font !== 'source-han-serif' && data.settings.find(row => row.key === `unlocked:font:${font}`)?.value !== true) {
    throw new Error('当前字体尚未购买')
  }
  return input as Backup
}
export async function importBackup(backup: Backup): Promise<void> {
  const valid = parseBackup(backup)
  const db = await openDatabase()
  const tx = db.transaction(TABLES, 'readwrite')
  const done = transactionDone(tx)
  try {
    for (const name of TABLES) tx.objectStore(name).clear()
    for (const name of TABLES) {
      const store = tx.objectStore(name)
      for (const row of valid.data[name]) store.put(row)
    }
    await done
    announceChange()
  } catch (error) {
    try { tx.abort() } catch { /* Already aborted by IndexedDB. */ }
    await done.catch(() => {})
    throw error
  }
}

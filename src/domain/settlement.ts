import { all, announceChange, openDatabase, requestValue, transactionDone } from '../db/database'
import type { TaskInstance, TimerRecord } from '../db/types'
import { localDateKey, nextMidnight } from './rules'
import { elapsedMs, materializeThrough } from './tasks'

/**
 * 打卡：记录完成比例并把任务标记为已结算。
 * 不再产生金币；percentage 仍保留，用于回顾当天的完成度。
 * 到期未完成的任务按 0% 自动结算（see reconcile）。
 */
export async function settleTask(id: string, percentage: number, now = Date.now(), automatic = false): Promise<boolean> {
  if (!Number.isSafeInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('完成比例须为 0～100 的整数')
  }
  const db = await openDatabase()
  const tx = db.transaction(['occurrences', 'timers'], 'readwrite')
  const done = transactionDone(tx)
  try {
    const row = await requestValue<TaskInstance | undefined>(tx.objectStore('occurrences').get(id))
    if (!row || row.status !== 'pending') {
      if (!automatic) throw new Error('任务已结算或已取消')
      await done
      return false
    }
    const midnight = nextMidnight(row.date)
    if (!automatic && now >= midnight) throw new Error('该任务已过期，请刷新以补算')
    if (automatic && now < midnight) throw new Error('任务尚未到结算时间')
    const at = automatic ? midnight : now
    // 到期自动结算时截断正在进行的计时。
    const timerStore = tx.objectStore('timers')
    const timer = await requestValue<TimerRecord | undefined>(timerStore.get(id))
    if (timer?.startedAt !== null && timer?.startedAt !== undefined) {
      timerStore.put({ ...timer, accumulatedMs: elapsedMs(timer, at), startedAt: null })
    }
    tx.objectStore('occurrences').put({
      ...row, status: 'settled', percentage, settledAt: at, payout: null,
    })
    await done
    announceChange()
    return true
  } catch (error) {
    try { tx.abort() } catch { /* IndexedDB already aborted the transaction. */ }
    await done.catch(() => {})
    throw error
  }
}

let reconciling: Promise<void> | null = null
/** 补算：生成截至今天的实例，并把过期的未完成任务按 0% 结算。 */
export function reconcile(now = Date.now()): Promise<void> {
  if (reconciling) return reconciling
  reconciling = (async () => {
    await materializeThrough(localDateKey(new Date(now)))
    const due = (await all('occurrences'))
      .filter(row => row.status === 'pending' && nextMidnight(row.date) <= now)
      .sort((a, b) => a.date.localeCompare(b.date))
    for (const row of due) await settleTask(row.id, 0, now, true)
  })().finally(() => { reconciling = null })
  return reconciling
}

/**
 * 结算原因文案：到期自动结算与手动打卡的说明不同，
 * 页面用它展示「到期未完成」之类的提示。
 */
export function settlementReason(row: TaskInstance): string {
  if (row.status !== 'settled') return ''
  return row.percentage === 0 ? '到期未完成' : `已结算 ${row.percentage}%`
}

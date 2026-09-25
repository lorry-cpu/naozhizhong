import { all, announceChange, openDatabase, requestValue, transactionDone } from '../db/database'
import type { CoinEntry, Setting, TaskInstance, TimerRecord } from '../db/types'
import { localDateKey, nextMidnight, payoutFor, rewardCap, THEMES, type ThemeId } from './rules'
import { elapsedMs, materializeThrough } from './tasks'

export async function balance(): Promise<number> {
  return (await all('ledger')).reduce((sum, entry) => sum + entry.amount, 0)
}

export async function settleTask(id: string, percentage: number, now = Date.now(), automatic = false): Promise<boolean> {
  // Validate before opening a write transaction, then re-read the row inside it.
  payoutFor(1, percentage)
  const db = await openDatabase()
  const tx = db.transaction(['occurrences', 'timers', 'ledger'], 'readwrite')
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
    const amount = payoutFor(rewardCap(row.minutes, row.difficulty), percentage)
    const timerStore = tx.objectStore('timers')
    const timer = await requestValue<TimerRecord | undefined>(timerStore.get(id))
    if (timer?.startedAt !== null && timer?.startedAt !== undefined) {
      timerStore.put({ ...timer, accumulatedMs: elapsedMs(timer, at), startedAt: null })
    }
    const entry: CoinEntry = {
      id: `task:${id}`, sourceKey: `task:${id}`, at, amount,
      reason: `${automatic ? '到期未完成' : `打卡 ${percentage}%`} · ${row.title}`,
    }
    tx.objectStore('occurrences').put({ ...row, status: 'settled', percentage, payout: amount, settledAt: at })
    tx.objectStore('ledger').add(entry)
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

export async function redeem(theme: ThemeId, now = Date.now()): Promise<void> {
  const item = THEMES.find(option => option.id === theme)
  if (!item || item.price === 0) throw new Error('请选择可兑换的风格')
  const db = await openDatabase()
  const tx = db.transaction(['ledger', 'settings'], 'readwrite')
  const done = transactionDone(tx)
  try {
    const settings = tx.objectStore('settings')
    const unlocked = await requestValue<Setting | undefined>(settings.get(`unlocked:${theme}`))
    if (unlocked?.value === true) throw new Error('已经兑换过该风格')
    const ledger = tx.objectStore('ledger')
    const entries = await requestValue<CoinEntry[]>(ledger.getAll())
    if (entries.reduce((sum, entry) => sum + entry.amount, 0) < item.price) throw new Error('金币不足，暂时无法兑换')
    const id = crypto.randomUUID()
    ledger.add({ id, sourceKey: `redemption:${id}`, amount: -item.price, at: now, reason: `兑换风格 · ${item.name}` })
    settings.put({ key: `unlocked:${theme}`, value: true })
    settings.put({ key: 'theme', value: theme })
    await done
    announceChange()
  } catch (error) {
    try { tx.abort() } catch { /* IndexedDB already aborted the transaction. */ }
    await done.catch(() => {})
    throw error
  }
}

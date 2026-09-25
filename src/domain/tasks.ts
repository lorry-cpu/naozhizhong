import { all, announceChange, byId, openDatabase, requestValue, save, transactionDone } from '../db/database.ts'
import type { TaskInstance, TaskTemplate, TimerRecord } from '../db/types'
import { localDateKey, localMidnight, nextMidnight, occurrenceId, type Difficulty, type RepeatRule } from './rules.ts'

export function appliesOn(template: TaskTemplate, date: string): boolean {
  if (date < template.startDate || (template.endDate && date > template.endDate)) return false
  if (template.repeat === 'none') return date === template.startDate
  if (template.repeat === 'daily') return true
  return new Date(localMidnight(date)).getDay() === new Date(localMidnight(template.startDate)).getDay()
}

export function datesThrough(start: string, end: string): string[] {
  const result: string[] = []
  for (let at = localMidnight(start), last = localMidnight(end); at <= last; at = nextMidnight(localDateKey(new Date(at)))) {
    result.push(localDateKey(new Date(at)))
    if (result.length > 10000) throw new Error('计划日期范围过长')
  }
  return result
}

export function makeInstance(template: TaskTemplate, date: string): TaskInstance {
  return {
    id: occurrenceId(template.id, date), templateId: template.id, date,
    title: template.title, time: template.time, minutes: template.minutes,
    difficulty: template.difficulty, status: 'pending', percentage: null, settledAt: null, payout: null,
  }
}

export function validateTask(title: string, date: string, time: string, minutes: number, difficulty: Difficulty, repeat: RepeatRule) {
  if (!title.trim()) throw new Error('请填写任务名称')
  localMidnight(date)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('计划时间格式无效')
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 1440) throw new Error('预计用时须为 1～1440 分钟')
  if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('任务难度无效')
  if (!['none', 'daily', 'weekly'].includes(repeat)) throw new Error('重复方式无效')
}

export async function createTask(input: Omit<TaskTemplate, 'id' | 'endDate'>): Promise<TaskTemplate> {
  validateTask(input.title, input.startDate, input.time, input.minutes, input.difficulty, input.repeat)
  const template: TaskTemplate = { ...input, title: input.title.trim(), id: crypto.randomUUID(), endDate: null }
  await save('templates', template)
  await materializeThrough(localDateKey(new Date()))
  return template
}

export async function materializeThrough(end: string): Promise<void> {
  const templates = await all('templates')
  const db = await openDatabase()
  const tx = db.transaction('occurrences', 'readwrite')
  const done = transactionDone(tx)
  const store = tx.objectStore('occurrences')
  let changed = false
  for (const template of templates) {
    if (template.startDate > end) continue
    for (const date of datesThrough(template.startDate, end)) {
      if (!appliesOn(template, date)) continue
      const id = occurrenceId(template.id, date)
      // `put` keeps existing per-day history untouched and a conditional read
      // allows repeated materialization after reopening the browser.
      if (!await requestValue(store.get(id))) { store.add(makeInstance(template, date)); changed = true }
    }
  }
  await done
  if (changed) announceChange()
}

export async function tasksForDate(date: string): Promise<TaskInstance[]> {
  localMidnight(date)
  await materializeThrough(date)
  const instances = await all('occurrences')
  return instances.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time))
}

export async function stopRepeating(templateId: string, today = localDateKey(new Date())): Promise<void> {
  const template = await byId('templates', templateId)
  if (!template) throw new Error('找不到任务')
  if (template.repeat === 'none') throw new Error('一次性任务没有后续安排')
  const db = await openDatabase()
  const tx = db.transaction(['templates', 'occurrences', 'timers'], 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore('templates').put({ ...template, endDate: today })
  const occurrences = await requestValue<TaskInstance[]>(tx.objectStore('occurrences').getAll())
  for (const item of occurrences) {
    if (item.templateId === templateId && item.date > today && item.status === 'pending') {
      tx.objectStore('occurrences').delete(item.id)
      tx.objectStore('timers').delete(item.id)
    }
  }
  await done
  announceChange()
}

export async function changeRepeat(templateId: string, repeat: Exclude<RepeatRule, 'none'>, from: string): Promise<void> {
  localMidnight(from)
  const template = await byId('templates', templateId)
  if (!template || template.repeat === 'none') throw new Error('找不到重复安排')
  if (from <= localDateKey(new Date()) || from <= template.startDate || (template.endDate && from > template.endDate)) {
    throw new Error('新重复规则须从尚未开始的有效日期起执行')
  }
  if (!['daily', 'weekly'].includes(repeat)) throw new Error('重复规则无效')
  const db = await openDatabase()
  const tx = db.transaction(['templates', 'occurrences', 'timers'], 'readwrite')
  const done = transactionDone(tx)
  try {
    tx.objectStore('templates').put({ ...template, endDate: localDateKey(new Date(localMidnight(from) - 1)) })
    const replacement: TaskTemplate = { ...template, id: crypto.randomUUID(), startDate: from, repeat }
    tx.objectStore('templates').add(replacement)
    const occurrences = await requestValue<TaskInstance[]>(tx.objectStore('occurrences').getAll())
    for (const item of occurrences) {
      if (item.templateId === templateId && item.date >= from && item.status === 'pending') {
        tx.objectStore('occurrences').delete(item.id)
        tx.objectStore('timers').delete(item.id)
      }
    }
    await done
    announceChange()
  } catch (error) {
    try { tx.abort() } catch { /* Already aborted. */ }
    await done.catch(() => {})
    throw error
  }
}

export async function updateTask(instanceId: string, updates: Pick<TaskInstance, 'title' | 'time' | 'minutes' | 'difficulty'>): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('occurrences', 'readwrite')
  const done = transactionDone(tx)
  try {
    const item = await requestValue<TaskInstance | undefined>(tx.objectStore('occurrences').get(instanceId))
    if (!item || item.status !== 'pending' || nextMidnight(item.date) <= Date.now()) throw new Error('只能修改未到期且未结算的任务')
    validateTask(updates.title, item.date, updates.time, updates.minutes, updates.difficulty, 'none')
    tx.objectStore('occurrences').put({ ...item, ...updates, title: updates.title.trim() })
    await done
    announceChange()
  } catch (error) {
    try { tx.abort() } catch { /* Already completed. */ }
    await done.catch(() => {})
    throw error
  }
}

export async function cancelTask(instanceId: string): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(['occurrences', 'timers'], 'readwrite')
  const done = transactionDone(tx)
  try {
    const item = await requestValue<TaskInstance | undefined>(tx.objectStore('occurrences').get(instanceId))
    if (!item || item.status !== 'pending' || nextMidnight(item.date) <= Date.now()) throw new Error('只能取消未到期且未结算的任务')
    const timer = await requestValue<TimerRecord | undefined>(tx.objectStore('timers').get(instanceId))
    if (timer?.startedAt !== null && timer?.startedAt !== undefined) {
      tx.objectStore('timers').put({ ...timer, accumulatedMs: elapsedMs(timer), startedAt: null })
    }
    tx.objectStore('occurrences').put({ ...item, status: 'cancelled' })
    await done
    announceChange()
  } catch (error) {
    try { tx.abort() } catch { /* Already completed. */ }
    await done.catch(() => {})
    throw error
  }
}

export function elapsedMs(timer: TimerRecord | undefined, now = Date.now()): number {
  if (!timer) return 0
  return timer.accumulatedMs + (timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt))
}

export async function startTimer(instanceId: string, now = Date.now()): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(['occurrences', 'timers'], 'readwrite')
  const done = transactionDone(tx)
  try {
    const item = await requestValue<TaskInstance | undefined>(tx.objectStore('occurrences').get(instanceId))
    if (!item || item.status !== 'pending' || nextMidnight(item.date) <= now) throw new Error('只有未到期且未结算的任务可以计时')
    const store = tx.objectStore('timers')
    const current = await requestValue<TimerRecord | undefined>(store.get(instanceId))
    if (current?.startedAt === null || !current) store.put({ id: instanceId, accumulatedMs: current?.accumulatedMs ?? 0, startedAt: now })
    await done
    announceChange()
  } catch (error) {
    try { tx.abort() } catch { /* Already completed. */ }
    await done.catch(() => {})
    throw error
  }
}

export async function pauseTimer(instanceId: string, now = Date.now()): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(['occurrences', 'timers'], 'readwrite')
  const done = transactionDone(tx)
  const store = tx.objectStore('timers')
  const item = await requestValue<TaskInstance | undefined>(tx.objectStore('occurrences').get(instanceId))
  const current = await requestValue<TimerRecord | undefined>(store.get(instanceId))
  if (item?.status === 'pending' && current?.startedAt !== null && current?.startedAt !== undefined) {
    store.put({ ...current, accumulatedMs: elapsedMs(current, Math.min(now, nextMidnight(item.date))), startedAt: null })
  }
  await done
  announceChange()
}

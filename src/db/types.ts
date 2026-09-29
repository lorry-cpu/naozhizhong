import type { Difficulty, RepeatRule, ThemeId } from '../domain/rules'

export interface TaskTemplate {
  id: string
  title: string
  startDate: string
  time: string
  minutes: number
  difficulty: Difficulty
  repeat: RepeatRule
  endDate: string | null
}
export interface TaskInstance {
  id: string
  templateId: string
  date: string
  title: string
  time: string
  minutes: number
  difficulty: Difficulty
  status: 'pending' | 'settled' | 'cancelled'
  percentage: number | null
  settledAt: number | null
  /**
   * 已废弃：金币机制移除前用于记录结算金额。
   * 保留字段是为了能直接读入老数据而不报错，新记录一律写 null。
   */
  payout: number | null
}
export interface TimerRecord {
  id: string
  accumulatedMs: number
  startedAt: number | null
}
export interface Meal {
  id: string
  date: string
  kind: string
  time: string
  food: string
  spent: number | null
}
export interface Entertainment {
  id: string
  date: string
  category: string
  title: string
  plannedTime: string
  plannedMinutes: number
  actualMinutes: number | null
}
export interface Badminton {
  id: string
  date: string
  start: string
  end: string
  balls: number
  training: string
  feeling: string
}
export interface Setting {
  key: string
  value: string | number | boolean
}
/** 下载后缓存在本机的字体文件；不进备份（体积大且可重新下载）。 */
export interface FontBlob {
  id: string
  data: Blob
  bytes: number
  fetchedAt: number
}
export interface Tables {
  templates: TaskTemplate
  occurrences: TaskInstance
  timers: TimerRecord
  meals: Meal
  entertainment: Entertainment
  badminton: Badminton
  settings: Setting
  fontBlobs: FontBlob
}
export type TableName = keyof Tables
export type AppTheme = ThemeId

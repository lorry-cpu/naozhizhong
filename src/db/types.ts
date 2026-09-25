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
  payout: number | null
}
export interface TimerRecord {
  id: string
  accumulatedMs: number
  startedAt: number | null
}
export interface CoinEntry {
  id: string
  sourceKey: string
  amount: number
  at: number
  reason: string
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
export interface Tables {
  templates: TaskTemplate
  occurrences: TaskInstance
  timers: TimerRecord
  ledger: CoinEntry
  meals: Meal
  entertainment: Entertainment
  badminton: Badminton
  settings: Setting
}
export type TableName = keyof Tables
export type AppTheme = ThemeId

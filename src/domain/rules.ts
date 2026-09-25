export type Difficulty = 'easy' | 'medium' | 'hard'
export type ThemeId = 'warm' | 'cool' | 'focus'
export type RepeatRule = 'none' | 'daily' | 'weekly'

export const THEMES: ReadonlyArray<{ id: ThemeId; name: string; price: number }> = [
  { id: 'warm', name: '温暖日常', price: 0 },
  { id: 'cool', name: '清爽冷调', price: 90 },
  { id: 'focus', name: '专注简约', price: 160 },
]

const difficultyRates: Record<Difficulty, number> = {
  easy: 6,
  medium: 10,
  hard: 14,
}

export function rewardCap(minutes: number, difficulty: Difficulty): number {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new Error('预计用时须为正整数分钟')
  if (!(difficulty in difficultyRates)) throw new Error('请选择正确的难度')
  return Math.ceil(minutes / 30) * difficultyRates[difficulty]
}

export function payoutFor(cap: number, percentage: number): number {
  if (!Number.isSafeInteger(cap) || cap <= 0) throw new Error('金币满额须为正整数')
  if (!Number.isSafeInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('完成比例须为 0～100 的整数')
  }
  if (percentage >= 50) return Math.round(cap * percentage / 100)
  return -Math.max(1, Math.round(cap * (1 - 2 * percentage / 100)))
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localMidnight(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('日期格式无效')
  const [year, month, day] = dateKey.split('-').map(Number)
  const result = new Date(year, month - 1, day)
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) {
    throw new Error('日期无效')
  }
  return result.getTime()
}

export function nextMidnight(dateKey: string): number {
  const start = new Date(localMidnight(dateKey))
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime()
}

export function occurrenceId(templateId: string, dateKey: string): string {
  return `${templateId}@${dateKey}`
}

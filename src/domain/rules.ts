export type Difficulty = 'easy' | 'medium' | 'hard'
export type ThemeId = 'warm' | 'cool' | 'focus'
/**
 * 只保留开源字体（SIL OFL 1.1），可以随仓库/Release 自由分发。
 * 商业字体（汉仪、潮字社、上首等）已移除：它们的授权不允许公开分发。
 */
export type FontId = 'source-han-serif' | 'source-han-sans'
export type RepeatRule = 'none' | 'daily' | 'weekly'

export const THEMES: ReadonlyArray<{ id: ThemeId; name: string }> = [
  { id: 'warm', name: '温暖日常' },
  { id: 'cool', name: '清爽冷调' },
  { id: 'focus', name: '专注简约' },
]

export const FONTS: ReadonlyArray<{ id: FontId; name: string; preview: string }> = [
  { id: 'source-han-serif', name: '思源宋体', preview: '沉静阅读，慢慢积累。' },
  { id: 'source-han-sans', name: '思源黑体', preview: '简洁现代，阅读轻松。' },
]

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

export type Difficulty = 'easy' | 'medium' | 'hard'
export type ThemeId = 'warm' | 'cool' | 'focus'
export type FontId =
  | 'fangsong'
  | 'kaiti'
  | 'handbook'
  | 'source-han-sans'
  | 'minimal'
  | 'handwrite'
  | 'source-han-serif'
  | 'chaozi'
  | 'dunhuang'
  | 'hefeng'
  | 'yongzi'
  | 'yange'
  | 'shangshou'
  | 'mengqingjiang'
  | 'tianwangxing'
export type RepeatRule = 'none' | 'daily' | 'weekly'

export const THEMES: ReadonlyArray<{ id: ThemeId; name: string; price: number }> = [
  { id: 'warm', name: '温暖日常', price: 0 },
  { id: 'cool', name: '清爽冷调', price: 90 },
  { id: 'focus', name: '专注简约', price: 160 },
]

export const FONTS: ReadonlyArray<{ id: FontId; name: string; price: number; preview: string }> = [
  { id: 'fangsong', name: '仿宋体', price: 200, preview: '清晰端正，适合每天使用。' },
  { id: 'kaiti', name: '楷体', price: 200, preview: '一笔一画，温和有序。' },
  { id: 'handbook', name: '手帐风格 · 华文行楷', price: 200, preview: '写下今天的小目标。' },
  { id: 'source-han-sans', name: '思源黑体', price: 200, preview: '简洁现代，阅读轻松。' },
  { id: 'minimal', name: '极简风格 · 等线', price: 200, preview: '专注当下，保持节奏。' },
  { id: 'handwrite', name: '手写体 · 华文隶书', price: 200, preview: '把生活写成自己的样子。' },
  { id: 'source-han-serif', name: '思源宋体', price: 0, preview: '沉静阅读，慢慢积累。' },
  { id: 'chaozi', name: '潮字社放浪简', price: 200, preview: '自由舒展，写出鲜明个性。' },
  { id: 'dunhuang', name: '敦煌飞天楷', price: 200, preview: '古意流转，端庄而灵动。' },
  { id: 'hefeng', name: '和风书道昭和银龙·传神', price: 200, preview: '落笔有势，书写更有气韵。' },
  { id: 'yongzi', name: '汉仪永字流云隶', price: 200, preview: '隶意舒朗，日常记录也从容。' },
  { id: 'yange', name: 'Aa燕歌行', price: 200, preview: '轻盈有致，让页面更有风格。' },
  { id: 'shangshou', name: '上首仙墨书法体', price: 200, preview: '墨色纵横，适合醒目的标题。' },
  { id: 'mengqingjiang', name: '汉仪孟庆江行书', price: 200, preview: '行云流水，记录每个念头。' },
  { id: 'tianwangxing', name: '天王星像素', price: 200, preview: '像素清晰，带来轻巧的科技感。' },
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

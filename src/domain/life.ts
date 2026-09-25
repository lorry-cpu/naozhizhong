import type { Badminton, Entertainment, Meal } from '../db/types'
import { localMidnight } from './rules.ts'

const timeValid = (text: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(text)
export function mondayOf(date: string): string {
  const at = new Date(localMidnight(date))
  at.setDate(at.getDate() - ((at.getDay() + 6) % 7))
  const y = at.getFullYear(), m = String(at.getMonth() + 1).padStart(2, '0'), d = String(at.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
export function validateMeal(row: Meal): void {
  localMidnight(row.date)
  if (!row.kind.trim() || !row.food.trim() || !timeValid(row.time)) throw new Error('请填写餐次、食物与有效用餐时间')
  if (row.spent !== null && (!Number.isFinite(row.spent) || row.spent < 0 || Math.round(row.spent * 100) !== row.spent * 100)) throw new Error('实际花费须为非负金额，最多两位小数')
}
export function validateEntertainment(row: Entertainment): void {
  localMidnight(row.date)
  if (!row.category.trim() || !row.title.trim() || !timeValid(row.plannedTime)) throw new Error('请填写娱乐类别、项目与计划开始时间')
  if (!Number.isSafeInteger(row.plannedMinutes) || row.plannedMinutes < 1 || row.plannedMinutes > 1440) throw new Error('计划时长须为 1～1440 分钟')
  if (row.actualMinutes !== null && (!Number.isSafeInteger(row.actualMinutes) || row.actualMinutes < 0 || row.actualMinutes > 1440)) throw new Error('实际时长须为 0～1440 分钟')
}
export function validateBadminton(row: Badminton): void {
  localMidnight(row.date)
  if (!timeValid(row.start) || !timeValid(row.end) || row.end <= row.start) throw new Error('结束时间须晚于开始时间')
  if (!Number.isSafeInteger(row.balls) || row.balls < 0) throw new Error('用球数量须为非负整数')
  if (!row.training.trim() || !row.feeling.trim()) throw new Error('请填写训练内容与感受')
}
export function badmintonMinutes(row: Badminton): number {
  const [h1, m1] = row.start.split(':').map(Number)
  const [h2, m2] = row.end.split(':').map(Number)
  return (h2 - h1) * 60 + m2 - m1
}

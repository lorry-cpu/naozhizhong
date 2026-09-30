import type { TaskInstance, TaskTemplate, TimerRecord } from '../db/types'

export type TaskExport = {
  version: 1
  exportedAt: string
  templates: TaskTemplate[]
  occurrences: TaskInstance[]
  timers: TimerRecord[]
}

export function taskJson(data: TaskExport): string {
  return JSON.stringify(data, null, 2)
}

const csvCell = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`

export function taskCsv(items: TaskInstance[]): string {
  const header = ['日期', '开始时间', '内容', '预计分钟', '难度', '状态', '完成比例']
  const rows = items.map(item => [
    item.date, item.time, item.title, item.minutes, item.difficulty,
    item.status, item.percentage,
  ])
  return '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function calendarDate(day: string, time: string, minutes = 0) {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const result = new Date(year, month - 1, date, hour, minute + minutes)
  return `${result.getFullYear()}${String(result.getMonth() + 1).padStart(2, '0')}${String(result.getDate()).padStart(2, '0')}T${String(result.getHours()).padStart(2, '0')}${String(result.getMinutes()).padStart(2, '0')}00`
}

const escapeCalendar = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;')

export function taskIcs(items: TaskInstance[], exportedAt: string): string {
  const stamp = exportedAt.replace(/[-:]/g, '').replace(/\.\d+/, '')
  const events = items.filter(item => item.status !== 'cancelled').map(item => [
    'BEGIN:VEVENT',
    `UID:${encodeURIComponent(item.id)}@naozhizhong.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${calendarDate(item.date, item.time)}`,
    `DTEND:${calendarDate(item.date, item.time, item.minutes)}`,
    `SUMMARY:${escapeCalendar(item.title)}`,
    `DESCRIPTION:${escapeCalendar(`难度：${item.difficulty}；预计：${item.minutes} 分钟；状态：${item.status === 'settled' ? `已完成 ${item.percentage}%` : '未完成'}`)}`,
    'END:VEVENT',
  ])
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NaoZhiZhong//Tasks//ZH', 'CALSCALE:GREGORIAN', ...events.flat(), 'END:VCALENDAR'].join('\r\n') + '\r\n'
}

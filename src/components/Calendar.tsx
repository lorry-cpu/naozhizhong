import { localDateKey } from '../domain/rules'

export interface CalendarEntry {
  date: string
  count: number
}

function monthStart(date: string) {
  const [year, month] = date.split('-').map(Number)
  return new Date(year, month - 1, 1)
}
function dateKey(date: Date) {
  return localDateKey(date)
}
function shiftMonth(date: string, amount: number) {
  const next = monthStart(date)
  next.setMonth(next.getMonth() + amount)
  return dateKey(next).slice(0, 7)
}
function daysForMonth(month: string) {
  const start = monthStart(`${month}-01`)
  const offset = (start.getDay() + 6) % 7
  const first = new Date(start)
  first.setDate(first.getDate() - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first)
    day.setDate(first.getDate() + index)
    return day
  })
}
const weekDays = ['一', '二', '三', '四', '五', '六', '日']

export function Calendar({ value, onChange, entries = [], ariaLabel = '日期日历' }: {
  value: string
  onChange: (date: string) => void
  entries?: CalendarEntry[]
  ariaLabel?: string
}) {
  const month = value.slice(0, 7)
  const entryCounts = new Map(entries.map(entry => [entry.date, entry.count]))
  const days = daysForMonth(month)
  return <div className="calendar" aria-label={ariaLabel}>
    <div className="calendar-header">
      <button type="button" className="button-secondary" aria-label="上个月" onClick={() => onChange(`${shiftMonth(`${month}-01`, -1)}-01`)}>‹</button>
      <strong>{monthStart(`${month}-01`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</strong>
      <button type="button" className="button-secondary" aria-label="下个月" onClick={() => onChange(`${shiftMonth(`${month}-01`, 1)}-01`)}>›</button>
    </div>
    <div className="calendar-weekdays">{weekDays.map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">
      {days.map(day => {
        const date = dateKey(day)
        const count = entryCounts.get(date) ?? 0
        const currentMonth = date.startsWith(month)
        return <button key={date} type="button" className={`calendar-day ${currentMonth ? '' : 'outside'} ${date === value ? 'selected' : ''}`}
          aria-label={date} aria-current={date === value ? 'date' : undefined} onClick={() => onChange(date)}>
          <span>{day.getDate()}</span>{count > 0 && <small>{count}</small>}
        </button>
      })}
    </div>
  </div>
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { all, remove, save, watchChanges } from '../db/database'
import type { Meal } from '../db/types'
import { validateMeal } from '../domain/life'
import {
  datesFrom,
  daySubtitle,
  fullDateLabel,
  LifeCalendarShell,
  mondayOf,
  parseDate,
  rangeFor,
  shortWeekdayNames,
  todayKey,
  weekdayNames,
  type LifeViewMode,
} from '../components/LifeCalendarShell'

const fresh = (date: string): Meal => ({ id: crypto.randomUUID(), date, kind: '早餐', time: '08:00', food: '', spent: null })
const money = (value: number) => `¥${value.toFixed(2)}`

export function FoodPage() {
  const [date, setDate] = useState(todayKey())
  const [mode, setMode] = useState<LifeViewMode>('month')
  const [rows, setRows] = useState<Meal[]>([])
  const [form, setForm] = useState<Meal>(() => fresh(todayKey()))
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => void all('meals').then(setRows).catch(e => setError(String(e)))
    load()
    return watchChanges(load)
  }, [])

  const daily = useMemo(() => rows.filter(row => row.date === date).sort((a, b) => a.time.localeCompare(b.time)), [date, rows])
  const week = mondayOf(date)
  const weekly = useMemo(() => rows.filter(row => mondayOf(row.date) === week), [rows, week])
  const monthly = useMemo(() => rows.filter(row => row.date.startsWith(date.slice(0, 7))), [date, rows])
  const spent = (list: Meal[]) => list.reduce((sum, row) => sum + (row.spent ?? 0), 0)
  const range = rangeFor(date, mode)

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      validateMeal(form)
      await save('meals', { ...form, kind: form.kind.trim(), food: form.food.trim() })
      setError('')
      setEditing(false)
      setDate(form.date)
      setMode('day')
      setForm(fresh(form.date))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function edit(row: Meal) {
    setForm(row)
    setDate(row.date)
    setEditing(true)
    setMode('day')
  }

  function renderChip(row: Meal, compact = false) {
    const detail = row.spent === null ? '未记录花费' : money(row.spent)
    return <button type="button" className={`task-calendar-chip ${compact ? 'compact' : ''} life-food-chip`} onClick={() => setDate(row.date)}
      title={`${row.kind} · ${row.food}`} aria-label={`${row.date} ${row.kind} ${row.food}`}>
      <span className="task-chip-check" aria-hidden="true">●</span><span>{row.kind} · {row.food}{compact ? '' : ` · ${detail}`}</span>
    </button>
  }

  function renderMonthView() {
    const month = date.slice(0, 7)
    return <div className="tasks-month-view life-month-view" aria-label="月视图">
      <div className="tasks-weekday-row">{shortWeekdayNames.map(day => <span key={day}>周{day}</span>)}</div>
      <div className="tasks-month-grid">{datesFrom(range.start, 42).map(day => {
        const dayDate = parseDate(day)
        const dayRows = rows.filter(row => row.date === day).sort((a, b) => a.time.localeCompare(b.time))
        return <div key={day} className={`tasks-month-cell calendar-day ${day.startsWith(month) ? '' : 'outside'} ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`} aria-label={day}>
          <button className="tasks-cell-date" type="button" aria-label={day} onClick={() => setDate(day)}><strong>{dayDate.getDate()}</strong><small>{day === todayKey() ? '今天' : ''}</small></button>
          <div className="tasks-cell-items">{dayRows.slice(0, 3).map(row => <span key={row.id}>{renderChip(row, true)}</span>)}{dayRows.length > 3 && <small className="tasks-more">还有 {dayRows.length - 3} 餐</small>}</div>
        </div>
      })}</div>
      <p className="life-summary-line">{fullDateLabel(date)} 的餐次</p>
    </div>
  }

  function renderWeekView() {
    return <div className="tasks-week-view life-week-view" aria-label="周视图"><div className="tasks-week-grid">
      {datesFrom(range.start, 7).map(day => {
        const dayDate = parseDate(day)
        const dayRows = rows.filter(row => row.date === day).sort((a, b) => a.time.localeCompare(b.time))
        return <div key={day} className={`tasks-week-column ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`}>
          <button type="button" className="tasks-week-heading" onClick={() => setDate(day)}><span>{weekdayNames[dayDate.getDay()]}</span><strong>{dayDate.getDate()}</strong></button>
          <div className="tasks-week-items">{dayRows.map(row => <span key={row.id}>{renderChip(row)}</span>)}</div>
        </div>
      })}
    </div><p className="life-summary-line">{fullDateLabel(date)} 的餐次</p>
    </div>
  }

  function renderForm() {
    return <section className="life-editor-section">
      <div className="life-section-heading"><div><h3>{editing ? '修改餐次' : '添加餐次'}</h3><p>安排今天吃什么，也可以记录实际花费。</p></div><span className="life-section-mark">¥</span></div>
      <form className="task-form life-form" onSubmit={event => void submit(event)}>
        <div className="task-form-two"><label>用餐日期<input required type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>餐次<select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>{['早餐', '午餐', '晚餐', '加餐'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="task-form-two"><label>用餐时间<input required type="time" value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label><label>实际花费（元，可不填）<input aria-label="实际花费" type="number" min="0" step="0.01" value={form.spent ?? ''} onChange={event => setForm({ ...form, spent: event.target.value === '' ? null : Number(event.target.value) })} /></label></div>
        <label className="task-form-wide">吃什么<input aria-label="吃什么" required value={form.food} onChange={event => setForm({ ...form, food: event.target.value })} /></label>
        <div className="button-row"><button className="button-primary">保存餐次</button>{editing && <button type="button" className="button-secondary" onClick={() => { setEditing(false); setForm(fresh(date)) }}>取消修改</button>}</div>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  }

  function renderHistory() {
    return <section className="life-history-section">
      <div className="life-section-heading"><div><h3>{fullDateLabel(date)} 的餐次</h3><p>已记录花费 {money(spent(daily))}</p></div></div>
      <div className="life-entry-list">{daily.length === 0 && <p className="life-empty">当天还没有餐次安排。</p>}{daily.map(row => <div className="life-record-card" key={row.id}>
        <div><strong>{row.time} · {row.kind}</strong><span>{row.food} · {row.spent === null ? '未记录花费' : money(row.spent)}</span></div>
        <div className="button-row"><button className="button-link" type="button" onClick={() => edit(row)}>编辑</button><button className="button-link" type="button" onClick={() => { if (window.confirm('删除这条餐次记录？')) void remove('meals', row.id).catch(e => setError(String(e))) }}>删除</button></div>
      </div>)}</div>
    </section>
  }

  function renderDayView() {
    return <div className="life-day-view" aria-label="日视图">
      <div className="tasks-day-heading"><div className="tasks-day-number">{parseDate(date).getDate()}</div><div><strong>{weekdayNames[parseDate(date).getDay()]}</strong><span>{daySubtitle(date)}</span></div></div>
      <section className="life-stat-strip" aria-label="消费统计">
        <div><span>今日消费</span><strong>{money(spent(daily))}</strong><small>{daily.length} 餐</small></div>
        <div><span>本周消费</span><strong>{money(spent(weekly))}</strong><small>自 {week} 起：{money(spent(weekly))} · {weekly.length} 餐</small></div>
        <div><span>本月消费</span><strong>{money(spent(monthly))}</strong><small>{date.slice(0, 7)} · {monthly.length} 餐</small></div>
      </section>
      {renderForm()}
      {renderHistory()}
    </div>
  }

  return <LifeCalendarShell title="饮食计划" subtitle="按餐次安排吃什么、几点吃，并记录实际花费" date={date} mode={mode} settingsScope="food"
    onDateChange={setDate} onModeChange={setMode} calendarLabel="饮食日历">
    {mode === 'month' ? <>{renderMonthView()}{renderForm()}{renderHistory()}</> : mode === 'week' ? <>{renderWeekView()}{renderForm()}{renderHistory()}</> : renderDayView()}
  </LifeCalendarShell>
}

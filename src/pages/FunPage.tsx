import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { all, remove, save, watchChanges } from '../db/database'
import type { Entertainment } from '../db/types'
import { validateEntertainment } from '../domain/life'
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
  useLifeDateSelection,
  weekColumnSlice,
  weekdayNames,
  type LifeViewMode,
} from '../components/LifeCalendarShell'

const fresh = (date: string): Entertainment => ({
  id: crypto.randomUUID(), date, category: '游戏', title: '',
  plannedTime: '19:00', plannedMinutes: 60, actualMinutes: null,
})

export function FunPage() {
  const [date, setDate] = useState(todayKey())
  const [mode, setMode] = useState<LifeViewMode>('month')
  const [rows, setRows] = useState<Entertainment[]>([])
  const [form, setForm] = useState<Entertainment>(() => fresh(todayKey()))
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => void all('entertainment').then(setRows).catch(e => setError(String(e)))
    load()
    return watchChanges(load)
  }, [])

  const daily = useMemo(() => rows.filter(row => row.date === date).sort((a, b) => a.plannedTime.localeCompare(b.plannedTime)), [date, rows])
  const week = mondayOf(date)
  const weekly = useMemo(() => rows.filter(row => mondayOf(row.date) === week), [rows, week])
  const range = rangeFor(date, mode)
  // 月／周视图点某天：选中并跳到日视图（与「今日计划」一致）。
  const selectDate = useLifeDateSelection(setDate, setMode, mode)
  const planned = (list: Entertainment[]) => list.reduce((sum, row) => sum + row.plannedMinutes, 0)
  const actual = (list: Entertainment[]) => list.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      validateEntertainment(form)
      await save('entertainment', { ...form, title: form.title.trim(), category: form.category.trim() })
      setError('')
      setDate(form.date)
      setMode('day')
      setEditing(false)
      setForm(fresh(form.date))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function edit(row: Entertainment) {
    setForm(row)
    setDate(row.date)
    setEditing(true)
    setMode('day')
  }

  function renderChip(row: Entertainment, compact = false) {
    const actualLabel = row.actualMinutes === null ? '未记录' : `${row.actualMinutes} 分钟`
    return <button type="button" className={`task-calendar-chip ${compact ? 'compact' : ''} life-fun-chip`} onClick={() => setDate(row.date)}
      title={`${row.category} · ${row.title}`} aria-label={`${row.date} ${row.category} ${row.title}`}>
      <span className="task-chip-check" aria-hidden="true">◆</span><span>{row.category} · {row.title}{compact ? '' : ` · 实际 ${actualLabel}`}</span><small>{row.plannedMinutes}分计划</small>
    </button>
  }

  function renderMonthView() {
    const month = date.slice(0, 7)
    return <div className="tasks-month-view life-month-view" aria-label="月视图">
      <div className="tasks-weekday-row">{shortWeekdayNames.map(day => <span key={day}>周{day}</span>)}</div>
      <div className="tasks-month-grid">{datesFrom(range.start, 42).map(day => {
        const dayDate = parseDate(day)
        const dayRows = rows.filter(row => row.date === day).sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))
        return <div key={day} className={`tasks-month-cell calendar-day ${day.startsWith(month) ? '' : 'outside'} ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`} aria-label={day}>
          <button className="tasks-cell-date" type="button" aria-label={day} onClick={() => selectDate(day)}><strong>{dayDate.getDate()}</strong><small>{day === todayKey() ? '今天' : ''}</small></button>
          <div className="tasks-cell-items">{dayRows.slice(0, 3).map(row => <span key={row.id}>{renderChip(row, true)}</span>)}{dayRows.length > 3 && <small className="tasks-more">还有 {dayRows.length - 3} 条</small>}</div>
        </div>
      })}</div>
      <p className="life-summary-line">{fullDateLabel(date)} 的娱乐安排</p>
    </div>
  }

  function renderWeekView() {
    return <div className="tasks-week-view life-week-view" aria-label="周视图"><div className="tasks-week-grid">
      {datesFrom(range.start, 7).map(day => {
        const dayDate = parseDate(day)
        const dayRows = rows.filter(row => row.date === day).sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))
        const { visible, hidden } = weekColumnSlice(dayRows)
        return <div key={day} className={`tasks-week-column ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`}>
          <button type="button" className="tasks-week-heading" onClick={() => selectDate(day)}><span>{weekdayNames[dayDate.getDay()]}</span><strong>{dayDate.getDate()}</strong></button>
          <div className="tasks-week-items">{visible.map(row => <span key={row.id}>{renderChip(row)}</span>)}{hidden > 0 && <small className="tasks-more">还有 {hidden} 条</small>}</div>
        </div>
      })}
    </div><p className="life-summary-line">{fullDateLabel(date)} 的娱乐安排</p>
    </div>
  }

  function renderForm() {
    return <section className="life-editor-section">
      <div className="life-section-heading"><div><h3>{editing ? '修改娱乐记录' : '安排娱乐'}</h3><p>先安排娱乐时间，再补记实际时长。</p></div><span className="life-section-mark">◆</span></div>
      <form className="task-form life-form" onSubmit={event => void submit(event)}>
        <div className="task-form-two"><label>日期<input type="date" required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>类别<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{['游戏', '电影', '阅读', '其他'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <label className="task-form-wide">娱乐项目<input aria-label="娱乐项目" required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <div className="task-form-two"><label>计划开始<input required type="time" value={form.plannedTime} onChange={event => setForm({ ...form, plannedTime: event.target.value })} /></label><label>计划时长（分钟）<input type="number" min="1" max="1440" required value={form.plannedMinutes} onChange={event => setForm({ ...form, plannedMinutes: Number(event.target.value) })} /></label></div>
        <label className="task-form-wide">实际时长（分钟，可不填）<input aria-label="实际时长" type="number" min="0" max="1440" value={form.actualMinutes ?? ''} onChange={event => setForm({ ...form, actualMinutes: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <div className="button-row"><button className="button-primary">保存娱乐记录</button>{editing && <button type="button" className="button-secondary" onClick={() => { setEditing(false); setForm(fresh(date)) }}>取消修改</button>}</div>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  }

  function renderHistory() {
    return <section className="life-history-section">
      <div className="life-section-heading"><div><h3>{fullDateLabel(date)} 的娱乐安排</h3><p>计划 {planned(daily)} 分钟 · 实际 {actual(daily)} 分钟</p></div></div>
      <div className="life-entry-list">{daily.length === 0 && <p className="life-empty">当天还没有娱乐安排。</p>}{daily.map(row => <div className="life-record-card" key={row.id}>
        <div><strong>{row.category} · {row.title} · {row.plannedTime} · 计划 {row.plannedMinutes} 分钟 · 实际 {row.actualMinutes === null ? '未记录' : `${row.actualMinutes} 分钟`}</strong></div>
        <div className="button-row"><button className="button-link" type="button" onClick={() => edit(row)}>编辑与记录实际</button><button className="button-link" type="button" onClick={() => { if (window.confirm('删除这条娱乐记录？')) void remove('entertainment', row.id).catch(e => setError(String(e))) }}>删除</button></div>
      </div>)}</div>
    </section>
  }

  function renderDayView() {
    const byCategory = weekly.reduce<Record<string, Entertainment[]>>((groups, row) => {
      (groups[row.category] ??= []).push(row)
      return groups
    }, {})
    return <div className="life-day-view" aria-label="日视图">
      <div className="tasks-day-heading"><div className="tasks-day-number">{parseDate(date).getDate()}</div><div><strong>{weekdayNames[parseDate(date).getDay()]}</strong><span>{daySubtitle(date)}</span></div></div>
      <section className="life-stat-strip" aria-label="娱乐统计">
        <div><span>今日安排</span><strong>{daily.length} 次</strong><small>实际 {actual(daily)} 分钟</small></div>
        <div><span>本周计划</span><strong>{planned(weekly)} 分钟</strong><small>实际 {actual(weekly)} 分钟</small></div>
        <div><span>类别分布</span><strong>{Object.keys(byCategory).length} 类</strong><small>自 {week} 起</small></div>
      </section>
      {renderForm()}
      {renderHistory()}
    </div>
  }

  return <LifeCalendarShell title="游戏娱乐" subtitle="先安排娱乐时间，再单独记录实际玩了多久" date={date} mode={mode} settingsScope="fun"
    onDateChange={setDate} onModeChange={setMode} calendarLabel="娱乐日历">
    {mode === 'month' ? <>{renderMonthView()}{renderForm()}{renderHistory()}</> : mode === 'week' ? <>{renderWeekView()}{renderForm()}{renderHistory()}</> : renderDayView()}
  </LifeCalendarShell>
}

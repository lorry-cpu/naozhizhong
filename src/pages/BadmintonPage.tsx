import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { all, remove, save, watchChanges } from '../db/database'
import type { Badminton } from '../db/types'
import { badmintonMinutes, validateBadminton } from '../domain/life'
import {
  datesFrom,
  daySubtitle,
  fullDateLabel,
  LifeCalendarShell,
  parseDate,
  rangeFor,
  shortWeekdayNames,
  todayKey,
  weekdayNames,
  type LifeViewMode,
} from '../components/LifeCalendarShell'

const fresh = (date = todayKey()): Badminton => ({
  id: crypto.randomUUID(), date, start: '18:00', end: '19:00',
  balls: 0, training: '', feeling: '',
})

export function BadmintonPage() {
  const [date, setDate] = useState(todayKey())
  const [mode, setMode] = useState<LifeViewMode>('month')
  const [rows, setRows] = useState<Badminton[]>([])
  const [form, setForm] = useState<Badminton>(fresh())
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => void all('badminton').then(setRows).catch(e => setError(String(e)))
    load()
    return watchChanges(load)
  }, [])

  const sorted = useMemo(() => [...rows].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)), [rows])
  const daily = sorted.filter(row => row.date === date)
  const range = rangeFor(date, mode)
  const periodRows = mode === 'month'
    ? rows.filter(row => row.date.startsWith(date.slice(0, 7)))
    : rows.filter(row => row.date >= rangeFor(date, 'week').start && row.date <= rangeFor(date, 'week').end)
  const totalMinutes = rows.reduce((sum, row) => sum + badmintonMinutes(row), 0)
  const totalBalls = rows.reduce((sum, row) => sum + row.balls, 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      validateBadminton(form)
      await save('badminton', { ...form, training: form.training.trim(), feeling: form.feeling.trim() })
      setEditing(false)
      setDate(form.date)
      setMode('day')
      setForm(fresh(form.date))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function edit(row: Badminton) {
    setForm(row)
    setDate(row.date)
    setEditing(true)
    setMode('day')
  }

  function renderChip(row: Badminton, compact = false) {
    const summary = compact ? `${row.start} · ${row.training} · ${row.feeling}` : `${row.start}—${row.end} · ${row.training}`
    return <button type="button" className={`task-calendar-chip ${compact ? 'compact' : ''} life-badminton-chip`} onClick={() => setDate(row.date)}
      title={`${row.start}—${row.end} · ${row.training}`} aria-label={`${row.date} ${row.start} ${row.training}`}>
      <span className="task-chip-check" aria-hidden="true">◆</span><span>{summary}</span><small>{row.balls}球</small>
    </button>
  }

  function renderMonthView() {
    const month = date.slice(0, 7)
    return <div className="tasks-month-view life-month-view" aria-label="月视图">
      <div className="tasks-weekday-row">{shortWeekdayNames.map(day => <span key={day}>周{day}</span>)}</div>
      <div className="tasks-month-grid">{datesFrom(range.start, 42).map(day => {
        const dayDate = parseDate(day)
        const dayRows = rows.filter(row => row.date === day).sort((a, b) => a.start.localeCompare(b.start))
        return <div key={day} className={`tasks-month-cell calendar-day ${day.startsWith(month) ? '' : 'outside'} ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`} aria-label={day}>
          <button className="tasks-cell-date" type="button" aria-label={day} onClick={() => setDate(day)}><strong>{dayDate.getDate()}</strong><small>{day === todayKey() ? '今天' : ''}</small></button>
          <div className="tasks-cell-items">{dayRows.slice(0, 3).map(row => <span key={row.id}>{renderChip(row, true)}</span>)}{dayRows.length > 3 && <small className="tasks-more">还有 {dayRows.length - 3} 场</small>}</div>
        </div>
      })}</div>
      <p className="life-summary-line">{rows.length} 次 · {totalMinutes} 分钟 · 消耗 {totalBalls} 个球</p>
      <p className="life-summary-line">{fullDateLabel(date)} 的打球记录</p>
    </div>
  }

  function renderWeekView() {
    return <div className="tasks-week-view life-week-view" aria-label="周视图"><div className="tasks-week-grid">
      {datesFrom(range.start, 7).map(day => {
        const dayDate = parseDate(day)
        const dayRows = rows.filter(row => row.date === day).sort((a, b) => a.start.localeCompare(b.start))
        return <div key={day} className={`tasks-week-column ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`}>
          <button type="button" className="tasks-week-heading" onClick={() => setDate(day)}><span>{weekdayNames[dayDate.getDay()]}</span><strong>{dayDate.getDate()}</strong></button>
          <div className="tasks-week-items">{dayRows.map(row => <span key={row.id}>{renderChip(row)}</span>)}</div>
        </div>
      })}
    </div><p className="life-summary-line">{fullDateLabel(date)} 的打球记录</p>
    </div>
  }

  function renderForm() {
    return <section className="life-editor-section">
      <div className="life-section-heading"><div><h3>{editing ? '修改打球记录' : '记录一次打球'}</h3><p>记录时间、用球、训练内容和当天的感受。</p></div><span className="life-section-mark">◆</span></div>
      <form className="task-form life-form" onSubmit={event => void submit(event)}>
        <div className="task-form-two"><label>打球日期<input type="date" required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>消耗球数<input aria-label="消耗球数" type="number" min="0" step="1" required value={form.balls} onChange={event => setForm({ ...form, balls: Number(event.target.value) })} /></label></div>
        <div className="task-form-two"><label>开始时间<input type="time" required value={form.start} onChange={event => setForm({ ...form, start: event.target.value })} /></label><label>结束时间<input aria-label="结束时间" type="time" required value={form.end} onChange={event => setForm({ ...form, end: event.target.value })} /></label></div>
        <label className="task-form-wide">训练内容<textarea aria-label="训练内容" required value={form.training} onChange={event => setForm({ ...form, training: event.target.value })} /></label>
        <label className="task-form-wide">个人感受<textarea aria-label="个人感受" required value={form.feeling} onChange={event => setForm({ ...form, feeling: event.target.value })} /></label>
        <div className="button-row"><button className="button-primary">保存打球记录</button>{editing && <button type="button" className="button-secondary" onClick={() => { setForm(fresh(date)); setEditing(false) }}>取消修改</button>}</div>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  }

  function renderHistory() {
    return <section className="life-history-section">
      <div className="life-section-heading"><div><h3>{fullDateLabel(date)} 的打球记录</h3><p>{daily.length ? `共 ${daily.length} 次` : '当天还没有打球记录。'}</p></div></div>
      <div className="life-entry-list">{daily.length === 0 && <p className="life-empty">当天还没有打球记录。</p>}{daily.map(row => <div className="life-record-card" key={row.id}>
        <div><strong>{row.start}—{row.end} · 用球 {row.balls} 个 · {badmintonMinutes(row)} 分钟</strong><span>训练：{row.training}<br />感受：{row.feeling}</span></div>
        <div className="button-row"><button className="button-link" type="button" onClick={() => edit(row)}>编辑</button><button className="button-link" type="button" onClick={() => { if (window.confirm('删除这次打球记录？')) void remove('badminton', row.id).catch(e => setError(String(e))) }}>删除</button></div>
      </div>)}</div>
    </section>
  }

  function renderDayView() {
    return <div className="life-day-view" aria-label="日视图">
      <div className="tasks-day-heading"><div className="tasks-day-number">{parseDate(date).getDate()}</div><div><strong>{weekdayNames[parseDate(date).getDay()]}</strong><span>{daySubtitle(date)}</span></div></div>
      <section className="life-stat-strip" aria-label="羽毛球统计">
        <div><span>今日场次</span><strong>{daily.length} 次</strong><small>{daily.reduce((sum, row) => sum + badmintonMinutes(row), 0)} 分钟</small></div>
        <div><span>当前周期</span><strong>{periodRows.length} 次</strong><small>{periodRows.reduce((sum, row) => sum + row.balls, 0)} 个球</small></div>
        <div><span>累计记录</span><strong>{rows.length} 次</strong><small>{rows.length} 次 · {totalMinutes} 分钟 · 消耗 {totalBalls} 个球</small></div>
      </section>
      {renderForm()}
      {renderHistory()}
    </div>
  }

  return <LifeCalendarShell title="羽毛球" subtitle="记录每次打球的时间、用球、训练内容与感受" date={date} mode={mode} settingsScope="badminton"
    onDateChange={setDate} onModeChange={setMode} calendarLabel="羽毛球日历">
    {mode === 'month' ? <>{renderMonthView()}{renderForm()}{renderHistory()}</> : mode === 'week' ? <>{renderWeekView()}{renderForm()}{renderHistory()}</> : renderDayView()}
  </LifeCalendarShell>
}

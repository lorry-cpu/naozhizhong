import { useEffect, useMemo, useRef, useState } from 'react'
import { all, saveSetting, watchChanges } from '../db/database'
import type { Setting } from '../db/types'
import {
  datesFrom,
  daySubtitle,
  fullDateLabel,
  LifeCalendarShell,
  monthGridStart,
  parseDate,
  rangeFor,
  shortWeekdayNames,
  todayKey,
  weekdayNames,
  type LifeViewMode,
} from '../components/LifeCalendarShell'

const keyFor = (date: string) => `memo:${date}`

export function MemoPage() {
  const [date, setDate] = useState(todayKey())
  const [mode, setMode] = useState<LifeViewMode>('month')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Setting[]>([])
  const [message, setMessage] = useState('')
  const editedDate = useRef<string | null>(null)
  const load = () => void all('settings').then(setRows).catch(error => setMessage(`读取备忘失败：${String(error)}`))

  useEffect(() => {
    load()
    return watchChanges(load)
  }, [])

  const records = useMemo(() => rows
    .filter(row => row.key.startsWith('memo:') && typeof row.value === 'string' && row.value.trim())
    .map(row => ({ date: row.key.slice(5), text: String(row.value) }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => b.date.localeCompare(a.date)), [rows])

  useEffect(() => {
    if (editedDate.current === date) return
    const saved = rows.find(row => row.key === keyFor(date))?.value
    const legacy = date === todayKey() ? rows.find(row => row.key === 'memo')?.value : undefined
    setText(typeof saved === 'string' ? saved : typeof legacy === 'string' ? legacy : '')
  }, [date, rows])

  async function save() {
    try {
      await saveSetting(keyFor(date), text)
      if (date === todayKey()) await saveSetting('memo', text)
      editedDate.current = null
      setMode('day')
      setMessage('备忘已保存到本机')
    } catch (error) {
      setMessage(`备忘保存失败：${String(error)}`)
    }
  }

  const recordsFor = (targetDate: string) => records.filter(record => record.date === targetDate)
  const range = rangeFor(date, mode)
  const renderChip = (record: { date: string; text: string }) =>
    <button type="button" className="task-calendar-chip compact memo-calendar-chip" onClick={() => setDate(record.date)}
      title={record.text} aria-label={`${record.date} ${record.text}`}>
      <span className="task-chip-check" aria-hidden="true">✎</span><span>{record.text}</span>
    </button>

  function renderHistory() {
    return <div className="memo-records-scroll">{records.map(record => <button className={`memo-record ${record.date === date ? 'active' : ''}`} key={record.date} type="button"
      aria-label={`${record.date} ${record.text}`} onClick={() => setDate(record.date)}>
      <strong>{record.date}</strong><span>{record.text}</span>
    </button>)}</div>
  }

  function renderMonthView() {
    const month = date.slice(0, 7)
    return <div className="tasks-month-view life-month-view" aria-label="月视图">
      <div className="tasks-weekday-row">{shortWeekdayNames.map(day => <span key={day}>周{day}</span>)}</div>
      <div className="tasks-month-grid">{datesFrom(range.start, 42).map(day => {
        const dayDate = parseDate(day)
        const dayRecords = recordsFor(day)
        return <div key={day} className={`tasks-month-cell calendar-day ${day.startsWith(month) ? '' : 'outside'} ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`} aria-label={day}>
          <button className="tasks-cell-date" type="button" aria-label={day} onClick={() => setDate(day)}><strong>{dayDate.getDate()}</strong><small>{day === todayKey() ? '今天' : ''}</small></button>
          <div className="tasks-cell-items">{dayRecords.slice(0, 3).map(renderChip)}{dayRecords.length > 3 && <small className="tasks-more">还有 {dayRecords.length - 3} 条</small>}</div>
        </div>
      })}</div>
      <div className="life-month-history"><div className="life-section-heading"><div><h3>每天记录</h3><p>{records.length ? `共 ${records.length} 天` : '还没有按日期保存的备忘。'}</p></div></div>{renderHistory()}</div>
    </div>
  }

  function renderWeekView() {
    return <div className="tasks-week-view life-week-view" aria-label="周视图"><div className="tasks-week-grid">
      {datesFrom(range.start, 7).map(day => {
        const dayDate = parseDate(day)
        const dayRecords = recordsFor(day)
        return <div key={day} className={`tasks-week-column ${day === date ? 'selected' : ''} ${day === todayKey() ? 'today' : ''}`}>
          <button type="button" className="tasks-week-heading" onClick={() => setDate(day)}><span>{weekdayNames[dayDate.getDay()]}</span><strong>{dayDate.getDate()}</strong></button>
          <div className="tasks-week-items">{dayRecords.map(renderChip)}</div>
        </div>
      })}
    </div><div className="life-month-history"><div className="life-section-heading"><div><h3>每天记录</h3></div></div>{renderHistory()}</div></div>
  }

  function renderEditor() {
    return <section className="life-editor-section life-quick-editor">
      <div className="life-section-heading"><div><h3>{fullDateLabel(date)} 的备忘</h3><p>把当天要记住的事情写在这里。</p></div><span className="life-section-mark">✎</span></div>
      <textarea id="memo-editor" className="life-textarea" value={text} onChange={event => { editedDate.current = date; setText(event.target.value) }} placeholder="记录今天想到的事情…" />
      <button className="button-primary" type="button" onClick={() => void save()}>保存备忘</button>
    </section>
  }

  function renderDayView() {
    const dayRecords = recordsFor(date)
    return <div className="life-day-view" aria-label="日视图">
      <div className="tasks-day-heading"><div className="tasks-day-number">{parseDate(date).getDate()}</div><div><strong>{weekdayNames[parseDate(date).getDay()]}</strong><span>{daySubtitle(date)}</span></div></div>
      {renderEditor()}
      <section className="life-history-section">
        <div className="life-section-heading"><div><h3>每天记录</h3><p>{records.length ? `共 ${records.length} 天` : '还没有按日期保存的备忘。'}</p></div></div>
        {renderHistory()}
      </section>
      {dayRecords.length === 0 && <p className="life-empty">这一天还没有保存备忘。</p>}
      {message && <p role="status" className="feedback">{message}</p>}
    </div>
  }

  return <LifeCalendarShell title="备忘录" subtitle="按日期记录和查看每天的备忘信息" date={date} mode={mode} settingsScope="memo"
    onDateChange={setDate} onModeChange={setMode} calendarLabel="备忘日历" dateInputLabel="备忘日期">
    {mode === 'month' ? <>{renderMonthView()}{renderEditor()}</> : mode === 'week' ? <>{renderWeekView()}{renderEditor()}</> : renderDayView()}
  </LifeCalendarShell>
}

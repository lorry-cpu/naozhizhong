import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { all, setting, saveSetting, watchChanges } from '../db/database'
import type { TaskInstance, TaskTemplate, TimerRecord } from '../db/types'
import { localDateKey, nextMidnight } from '../domain/rules'
import { cancelTask, changeRepeat, createTask, elapsedMs, materializeThrough, pauseTimer, startTimer, stopRepeating, updateTask } from '../domain/tasks'
import { settleTask } from '../domain/settlement'
import { exportBackup } from '../db/backup'
import { taskCsv, taskIcs, taskJson, type TaskExport } from '../domain/taskExport'
import { normalizeTextSize, normalizeTextTone, textToneOptions, type TextTone } from '../domain/calendarSettings'
import { weekColumnSlice } from '../components/LifeCalendarShell'

type ViewMode = 'day' | 'week' | 'month'
type Form = {
  title: string
  startDate: string
  time: string
  minutes: number
  difficulty: TaskTemplate['difficulty']
  repeat: TaskTemplate['repeat']
}
type CalendarSettings = {
  width: number
  scale: number
  opacity: number
  blur: number
  textTone: TextTone
  textSize: number
  hideCompleted: boolean
  showMonthTasks: boolean
}

const defaultSettings: CalendarSettings = {
  width: 1120,
  scale: 100,
  opacity: 78,
  blur: 26,
  textTone: 'light',
  textSize: 100,
  hideCompleted: false,
  showMonthTasks: true,
}
const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const shortWeekdayNames = ['一', '二', '三', '四', '五', '六', '日']
const difficultyLabels: Record<TaskTemplate['difficulty'], string> = { easy: '简单', medium: '中等', hard: '困难' }
const difficultyColors: Record<TaskTemplate['difficulty'], string> = { easy: '#75c4f2', medium: '#f0bf48', hard: '#ef8f9b' }
const lunarDayFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' })
const lunarMonthFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long' })
const lunarDigits = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const lunarDayName = (day: number) => {
  if (day <= 10) return `初${lunarDigits[day - 1]}`
  if (day < 20) return `十${lunarDigits[day - 11]}`
  if (day === 20) return '二十'
  if (day < 30) return `廿${lunarDigits[day - 21]}`
  return '三十'
}
const lunarLabel = (day: Date) => {
  if (day.getMonth() === 8 && day.getDate() === 10) return '教师节'
  if (day.getMonth() === 9 && day.getDate() === 1) return '国庆节'
  const raw = lunarDayFormatter.format(day)
  const numeric = /^(\d{1,2})日?$/.exec(raw)
  const lunarDay = numeric ? lunarDayName(Number(numeric[1])) : raw
  return lunarDay === '初一' ? lunarMonthFormatter.format(day) : lunarDay
}
const today = () => localDateKey(new Date())
const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const dateKey = (value: Date) => localDateKey(value)
const shiftDate = (value: string, amount: number) => {
  const next = parseDate(value)
  next.setDate(next.getDate() + amount)
  return dateKey(next)
}
const mondayOf = (value: string) => {
  const date = parseDate(value)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return dateKey(date)
}
const datesFrom = (start: string, count: number) => Array.from({ length: count }, (_, index) => shiftDate(start, index))
const monthGridStart = (value: string) => {
  const first = parseDate(`${value.slice(0, 7)}-01`)
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return dateKey(first)
}
const monthLabel = (value: string) => `${parseDate(value).getMonth() + 1}月`
const fullDateLabel = (value: string) => {
  const date = parseDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
const yearMonthLabel = (value: string) => {
  const date = parseDate(value)
  return `${date.getFullYear()}年 · ${date.getMonth() + 1}月`
}
const daySubtitle = (value: string) => {
  const date = parseDate(value)
  return `${date.getFullYear()}年 · ${weekdayNames[date.getDay()]}`
}
const initialForm = (date: string): Form => ({ title: '', startDate: date, time: '09:00', minutes: 30, difficulty: 'easy', repeat: 'none' })
const rangeFor = (date: string, mode: ViewMode) => {
  if (mode === 'day') return { start: date, end: date }
  if (mode === 'week') {
    const start = mondayOf(date)
    return { start, end: shiftDate(start, 6) }
  }
  const start = monthGridStart(date)
  return { start, end: shiftDate(start, 41) }
}
const settingNumber = (value: string | number | boolean | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
const settingBoolean = (value: string | number | boolean | undefined, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

export function TasksPage() {
  const [date, setDate] = useState(today())
  const [mode, setMode] = useState<ViewMode>('month')
  const [items, setItems] = useState<TaskInstance[]>([])
  const [timers, setTimers] = useState<Record<string, TimerRecord>>({})
  const [templates, setTemplates] = useState<Record<string, TaskTemplate>>({})
  const [form, setForm] = useState<Form>(initialForm(today()))
  const [formOpen, setFormOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [punch, setPunch] = useState<TaskInstance | null>(null)
  const [schedule, setSchedule] = useState<TaskInstance | null>(null)
  const [scheduleFrom, setScheduleFrom] = useState('')
  const [scheduleRepeat, setScheduleRepeat] = useState<'daily' | 'weekly'>('daily')
  const [percentage, setPercentage] = useState(100)
  const [clock, setClock] = useState(Date.now())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [settings, setSettings] = useState<CalendarSettings>(defaultSettings)
  const range = useMemo(() => rangeFor(date, mode), [date, mode])

  const load = useCallback(async () => {
    try {
      await materializeThrough(range.end)
      const [occurrences, recorded, source] = await Promise.all([all('occurrences'), all('timers'), all('templates')])
      setItems(occurrences)
      setTimers(Object.fromEntries(recorded.map(timer => [timer.id, timer])))
      setTemplates(Object.fromEntries(source.map(template => [template.id, template])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [range.end])

  useEffect(() => {
    void load()
    return watchChanges(() => void load())
  }, [load])
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    let active = true
    void Promise.all([
      setting('taskCalendarMode'),
      setting('taskCalendarWidth'),
      setting('taskCalendarScale'),
      setting('taskCalendarOpacity'),
      setting('taskCalendarBlur'),
      setting('taskCalendarTextTone'),
      setting('taskCalendarTextSize'),
      setting('taskCalendarHideCompleted'),
      setting('taskCalendarShowMonthTasks'),
    ]).then(([savedMode, width, scale, opacity, blur, textTone, textSize, hideCompleted, showMonthTasks]) => {
      if (!active) return
      if (savedMode === 'day' || savedMode === 'week' || savedMode === 'month') setMode(savedMode)
      setSettings({
        width: settingNumber(width, defaultSettings.width),
        scale: settingNumber(scale, defaultSettings.scale),
        opacity: settingNumber(opacity, defaultSettings.opacity),
        blur: settingNumber(blur, defaultSettings.blur),
        textTone: normalizeTextTone(textTone),
        textSize: normalizeTextSize(textSize),
        hideCompleted: settingBoolean(hideCompleted, defaultSettings.hideCompleted),
        showMonthTasks: settingBoolean(showMonthTasks, defaultSettings.showMonthTasks),
      })
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
    return () => { active = false }
  }, [])

  const currentItems = useMemo(() => items.filter(item => item.date === date && item.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time)), [date, items])
  const visibleItems = useMemo(() => items.filter(item => item.status !== 'cancelled' && (!settings.hideCompleted || item.status !== 'settled')), [items, settings.hideCompleted])
  const glassStrength = Math.min(1, Math.max(0, settings.blur / 48))
  const glassFill = Math.min(1, Math.max(0, settings.opacity / 100))
  const appStyle = {
    '--task-calendar-width': `${settings.width}px`,
    '--task-calendar-scale': String(settings.scale / 100),
    '--task-calendar-opacity': String(glassFill),
    '--task-calendar-blur': `${settings.blur}px`,
    '--task-calendar-text-scale': String(settings.textSize / 100),
    '--g': String(glassStrength),
    '--glass-fill': String(glassFill),
    '--glass-edge': String(0.1 + glassStrength * 0.26),
    '--glass-sheen': String(0.05 + glassStrength * 0.16),
    '--glass-sheen-soft': String((0.05 + glassStrength * 0.16) * 0.3),
    '--glass-sheen-strong': String((0.05 + glassStrength * 0.16) * 0.55),
    '--glass-sat': String(1.1 + glassStrength * 1.5),
    '--glass-shadow-deep': String(0.22 + glassStrength * 0.22),
    '--glass-shadow-soft': String(0.1 + glassStrength * 0.12),
    '--glass-inset-top': String(0.12 + glassStrength * 0.38),
    '--glass-inset-left': String(0.05 + glassStrength * 0.16),
    '--glass-inset-right': String(0.03 + glassStrength * 0.1),
    '--glass-inset-bottom': String(0.04 + glassStrength * 0.14),
    '--glass-inset-outline': String(glassStrength * 0.07),
    '--glass-highlight-start': String(glassStrength * 0.1),
    '--glass-highlight-end': String(glassStrength * 0.05),
    '--glass-highlight-opacity': String(0.35 + glassStrength * 0.65),
    '--glass-dark-edge': String(0.34 + glassStrength * 0.3),
    '--glass-dark-sheen': String(0.22 + glassStrength * 0.3),
    '--glass-dark-sheen-strong': String(0.14 + glassStrength * 0.22),
    '--glass-dark-shadow-deep': String(0.16 + glassStrength * 0.18),
    '--glass-dark-shadow-soft': String(0.07 + glassStrength * 0.1),
    '--glass-dark-inset-top': String(0.55 + glassStrength * 0.4),
    '--glass-dark-inset-bottom': String(0.04 + glassStrength * 0.1),
    '--glass-dark-inset-outline': String(0.3 + glassStrength * 0.35),
  } as CSSProperties

  async function attempt(action: () => Promise<unknown>) {
    try {
      setError('')
      await action()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  async function persistSetting<K extends keyof CalendarSettings>(key: K, value: CalendarSettings[K]) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    const dbKey = ({ width: 'taskCalendarWidth', scale: 'taskCalendarScale', opacity: 'taskCalendarOpacity', blur: 'taskCalendarBlur', textTone: 'taskCalendarTextTone', textSize: 'taskCalendarTextSize', hideCompleted: 'taskCalendarHideCompleted', showMonthTasks: 'taskCalendarShowMonthTasks' } as const)[key]
    try {
      await saveSetting(dbKey, value)
      setMessage('界面设置已保存')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  async function changeMode(next: ViewMode) {
    setMode(next)
    try {
      await saveSetting('taskCalendarMode', next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  async function downloadTasks(format: 'json' | 'csv' | 'ics') {
    try {
      setError('')
      const backup = await exportBackup()
      const data: TaskExport = {
        version: 1,
        exportedAt: backup.exportedAt,
        templates: backup.data.templates,
        occurrences: backup.data.occurrences,
        timers: backup.data.timers,
      }
      const contents = format === 'json' ? taskJson(data)
        : format === 'csv' ? taskCsv(data.occurrences)
          : taskIcs(data.occurrences, data.exportedAt)
      const mime = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/calendar'
      const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }))
      const link = document.createElement('a')
      link.href = url
      link.download = `闹之钟-计划-${today()}.${format}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setMessage(`计划已导出为 ${format.toUpperCase()}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  function moveDate(amount: number) {
    if (mode === 'month') {
      const next = parseDate(`${date.slice(0, 7)}-01`)
      next.setMonth(next.getMonth() + amount)
      setDate(dateKey(next))
      return
    }
    setDate(shiftDate(date, mode === 'week' ? amount * 7 : amount))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editing && form.startDate < today()) {
      setError('不能新建已经过去的计划')
      return
    }
    await attempt(async () => {
      if (editing) await updateTask(editing, { title: form.title, time: form.time, minutes: form.minutes, difficulty: form.difficulty })
      else await createTask(form)
      setDate(form.startDate)
      setForm(initialForm(form.startDate))
      setEditing(null)
      setFormOpen(false)
      setMessage(editing ? '计划已更新' : '计划已添加')
    })
  }
  function openCreate() {
    setForm(initialForm(date < today() ? today() : date))
    setEditing(null)
    setError('')
    setFormOpen(true)
  }
  function edit(item: TaskInstance) {
    setForm({ title: item.title, startDate: item.date, time: item.time, minutes: item.minutes, difficulty: item.difficulty, repeat: 'none' })
    setEditing(item.id)
    setFormOpen(true)
  }
  function selectDate(next: string) {
    setDate(next)
    if (mode === 'month' || mode === 'week') void changeMode('day')
  }
  function taskItemsFor(targetDate: string) {
    return visibleItems.filter(item => item.date === targetDate).sort((a, b) => a.time.localeCompare(b.time))
  }
  function renderTaskChip(item: TaskInstance, compact = false) {
    return <button type="button" className={`task-calendar-chip ${compact ? 'compact' : ''} ${item.status === 'settled' ? 'settled' : ''}`} style={{ '--task-accent': difficultyColors[item.difficulty] } as CSSProperties} onClick={() => selectDate(item.date)} title={`${item.title} · ${difficultyLabels[item.difficulty]}`}>
      <span className="task-chip-check" aria-hidden="true">{item.status === 'settled' ? '✓' : '○'}</span><span>{item.title}</span>{!compact && <small>{item.time}</small>}
    </button>
  }
  function renderMonthView() {
    const month = date.slice(0, 7)
    return <div className="tasks-month-view" aria-label="月视图">
      <div className="tasks-weekday-row">{shortWeekdayNames.map(day => <span key={day}>周{day}</span>)}</div>
      <div className="tasks-month-grid">{datesFrom(range.start, 42).map(day => {
        const dayItems = settings.showMonthTasks ? taskItemsFor(day) : []
        const dayDate = parseDate(day)
        return <div key={day} className={`tasks-month-cell calendar-day ${day.startsWith(month) ? '' : 'outside'} ${day === date ? 'selected' : ''} ${day === today() ? 'today' : ''}`} aria-label={day}>
          <button className="tasks-cell-date" type="button" aria-label={day} onClick={() => selectDate(day)}><strong>{dayDate.getDate()}</strong><small>{lunarLabel(dayDate)}</small></button>
          <div className="tasks-cell-items">{dayItems.slice(0, 4).map(item => <span key={item.id}>{renderTaskChip(item, true)}</span>)}{dayItems.length > 4 && <small className="tasks-more">还有 {dayItems.length - 4} 项…</small>}</div>
        </div>
      })}</div>
    </div>
  }
  function renderWeekView() {
    return <div className="tasks-week-view" aria-label="周视图"><div className="tasks-week-grid">{datesFrom(range.start, 7).map(day => {
      const dayDate = parseDate(day)
      const dayItems = taskItemsFor(day)
      const { visible, hidden } = weekColumnSlice(dayItems)
      return <div key={day} className={`tasks-week-column ${day === date ? 'selected' : ''} ${day === today() ? 'today' : ''}`}>
        <button type="button" className="tasks-week-heading" onClick={() => selectDate(day)}><span>{weekdayNames[dayDate.getDay()]}</span><strong>{dayDate.getDate()}</strong></button>
        <div className="tasks-week-items">{visible.map(item => <span key={item.id}>{renderTaskChip(item)}</span>)}{hidden > 0 && <small className="tasks-more">还有 {hidden} 项…</small>}</div>
      </div>
    })}</div></div>
  }
  function renderTaskRow(item: TaskInstance) {
    const timer = timers[item.id]
    const elapsed = Math.floor(elapsedMs(timer, clock) / 1000)
    const formatted = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
    const repeat = templates[item.templateId]?.repeat
    return <div className={`tasks-day-row task-row ${item.status === 'settled' ? 'settled' : ''}`} key={item.id} style={{ '--task-accent': difficultyColors[item.difficulty] } as CSSProperties}>
      <button type="button" className="task-row-check" aria-label={`${item.status === 'settled' ? '已完成' : '标记完成'} ${item.title}`} onClick={() => { if (item.status === 'pending') { setPunch(item); setPercentage(100) } }}>{item.status === 'settled' ? '✓' : '○'}</button>
      <div className="tasks-day-row-main task-detail"><strong>{item.title}</strong><small>{difficultyLabels[item.difficulty]} · 预计 {item.minutes} 分钟 · 已计时 {formatted}</small>{item.status === 'settled' && <small>{item.percentage === 0 ? '到期未完成' : `已完成 ${item.percentage}%`}</small>}</div>
      <time>{item.time}</time><span className="task-difficulty-label" style={{ color: difficultyColors[item.difficulty] }}>{difficultyLabels[item.difficulty]}</span>
      {item.status === 'pending' && <div className="tasks-row-actions">
        <button type="button" className="button-secondary" onClick={() => void attempt(() => timer?.startedAt !== null && timer?.startedAt !== undefined ? pauseTimer(item.id) : startTimer(item.id))}>{timer?.startedAt !== null && timer?.startedAt !== undefined ? '暂停计时' : elapsed > 0 ? '继续计时' : '开始计时'}</button>
        <button type="button" className="button-primary" onClick={() => { setPunch(item); setPercentage(100) }}>打卡</button>
        <button type="button" className="icon-button" aria-label={`编辑 ${item.title}`} title="编辑" onClick={() => edit(item)}>✎</button>
        <button type="button" className="icon-button" aria-label={`取消 ${item.title}`} title="取消" onClick={() => { if (window.confirm(`取消“${item.title}”这一天的计划吗？`)) void attempt(() => cancelTask(item.id)) }}>×</button>
        {repeat && repeat !== 'none' && <button type="button" className="button-link" aria-label="调整后续重复" onClick={() => { setSchedule(item); setScheduleFrom(localDateKey(new Date(nextMidnight(item.date)))); setScheduleRepeat(repeat === 'weekly' ? 'weekly' : 'daily') }}>调整后续</button>}
        {repeat && repeat !== 'none' && <button type="button" className="button-link" onClick={() => { if (window.confirm(`停止“${item.title}”之后的重复安排吗？`)) void attempt(() => stopRepeating(item.templateId)) }}>停止重复</button>}
      </div>}
    </div>
  }
  function renderDayView() {
    const day = parseDate(date)
    const dayItems = currentItems.filter(item => !settings.hideCompleted || item.status !== 'settled')
    return <div className="tasks-day-view" aria-label="日视图">
      <div className="tasks-day-heading"><div className="tasks-day-number">{day.getDate()}</div><div><strong>{weekdayNames[day.getDay()]}</strong><span>{lunarLabel(day)}</span></div></div>
      <div className="tasks-day-list tasks-list-scroll">{dayItems.length === 0 && <div className="tasks-empty">{currentItems.length ? '这一天的任务已全部隐藏。' : '这一天还没有计划，点击右上角“新增”开始。'}</div>}{dayItems.map(renderTaskRow)}</div>
    </div>
  }

  return <div className={`tasks-page tasks-text-${settings.textTone}`} style={appStyle}>
    <h1 className="tasks-accessible-heading">今日计划</h1>
    <div className="tasks-calendar-toolbar">
      <div className="tasks-calendar-title"><button type="button" className="tasks-round-button" aria-label="上一个时间段" onClick={() => moveDate(-1)}>‹</button><div><h2>{mode === 'day' ? fullDateLabel(date) : monthLabel(date)}</h2><p>{mode === 'month' ? `${yearMonthLabel(date)} · 点击日期查看当天` : mode === 'week' ? `${yearMonthLabel(date)} · ${fullDateLabel(range.start)}–${fullDateLabel(range.end)}` : `${daySubtitle(date)} · ${lunarLabel(parseDate(date))}`}</p></div><button type="button" className="tasks-round-button" aria-label="下一个时间段" onClick={() => moveDate(1)}>›</button><input className="tasks-date-input" aria-label="查看日期" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} /></div>
      <div className="tasks-calendar-actions"><div className="tasks-view-switch" role="group" aria-label="日周月视图">{(['day', 'week', 'month'] as const).map(item => <button key={item} type="button" className={mode === item ? 'active' : ''} aria-pressed={mode === item} onClick={() => void changeMode(item)}>{item === 'day' ? '日' : item === 'week' ? '周' : '月'}</button>)}</div><span className="tasks-sync-dot" title="本地数据已同步" aria-label="本地数据已同步" /><button type="button" className="tasks-add-button" aria-label="新建任务" title="新增" onClick={openCreate}><span aria-hidden="true">＋</span>新增</button><button type="button" className="tasks-settings-button" aria-label="界面设置" title="界面设置" onClick={() => setSettingsOpen(true)}>⚙</button></div>
    </div>
    <section className={`tasks-calendar-surface view-${mode}`} aria-label="计划日历">{mode === 'month' ? renderMonthView() : mode === 'week' ? renderWeekView() : renderDayView()}</section>
    {mode === 'day' && currentItems.some(item => item.status === 'pending') && <p className="tasks-day-hint">点击圆圈可以打卡，使用计时按钮记录实际用时。</p>}
    {message && <p role="status" className="feedback">{message}</p>}{error && <p role="alert" className="error">{error}</p>}

    {formOpen && <div className="dialog-backdrop" role="presentation"><section className="dialog task-dialog" role="dialog" aria-modal="true" aria-label={editing ? '编辑计划' : '新增待办'}>
      <div className="dialog-header"><div><h2>{editing ? '编辑计划' : '新增待办'}</h2><p className="muted-small">安排一件计划，完成后可以打卡记录完成比例。</p></div><button className="button-secondary dialog-close" type="button" aria-label="关闭新增窗口" onClick={() => setFormOpen(false)}>×</button></div>
      <form onSubmit={event => void submit(event)} className="task-form"><label className="task-form-wide">内容<input required autoFocus value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="例如：阅读专业资料" /></label>
        <div className="task-form-two"><label>日期<input type="date" required min={editing ? undefined : today()} disabled={Boolean(editing)} value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></label><label>开始时间<input type="time" required value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label></div>
        <div className={`task-form-detail-grid ${editing ? 'task-form-detail-grid-two' : 'task-form-detail-grid-three'}`}>
          <label>预计时间（分钟）<input aria-label="预计分钟" type="number" min="1" max="1440" required value={form.minutes} onChange={event => setForm({ ...form, minutes: Number(event.target.value) })} /></label>
          <label>难度<select aria-label="难度" value={form.difficulty} onChange={event => setForm({ ...form, difficulty: event.target.value as Form['difficulty'] })}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label>
          {!editing && <label>重复<select aria-label="重复" value={form.repeat} onChange={event => setForm({ ...form, repeat: event.target.value as Form['repeat'] })}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option></select></label>}
        </div>
        {error && <p role="alert" className="error">{error}</p>}<div className="dialog-actions"><button className="button-secondary" type="button" onClick={() => setFormOpen(false)}>取消</button><button aria-label="保存任务" className="button-primary" type="submit">添加</button></div>
      </form>
    </section></div>}

    {settingsOpen && <div className="dialog-backdrop" role="presentation"><section className="dialog task-settings-dialog" role="dialog" aria-modal="true" aria-label="界面设置">
      <div className="dialog-header"><div><h2>界面设置</h2><p className="muted-small">调整日历的尺寸、透明度和显示方式。</p></div><button className="button-secondary dialog-close" type="button" aria-label="关闭界面设置" onClick={() => setSettingsOpen(false)}>×</button></div>
      <div className="task-setting-section"><h3>尺寸</h3><label>宽度 <output>{settings.width}px</output><input aria-label="宽度" type="range" min="760" max="1300" step="10" value={settings.width} onChange={event => void persistSetting('width', Number(event.target.value))} /></label><label>整体缩放 <output>{settings.scale}%</output><input aria-label="整体缩放" type="range" min="80" max="120" step="5" value={settings.scale} onChange={event => void persistSetting('scale', Number(event.target.value))} /></label></div>
      <div className="task-setting-section"><h3>外观</h3><label>透明度 <output>{settings.opacity}%</output><input aria-label="透明度" type="range" min="45" max="100" step="1" value={settings.opacity} onChange={event => void persistSetting('opacity', Number(event.target.value))} /></label><label>毛玻璃 <output>{settings.blur}px</output><input aria-label="毛玻璃" type="range" min="0" max="48" step="1" value={settings.blur} onChange={event => void persistSetting('blur', Number(event.target.value))} /></label><label>文字大小 <output>{settings.textSize}%</output><input aria-label="文字大小" type="range" min="80" max="130" step="5" value={settings.textSize} onChange={event => void persistSetting('textSize', Number(event.target.value))} /></label><div className="task-text-tone"><span>文字颜色</span>{textToneOptions.map(option => <button key={option.value} type="button" className={settings.textTone === option.value ? 'active' : ''} onClick={() => void persistSetting('textTone', option.value)}>{option.label}</button>)}</div></div>
      <div className="task-setting-section"><h3>显示</h3><label className="task-checkbox"><input type="checkbox" checked={settings.hideCompleted} onChange={event => void persistSetting('hideCompleted', event.target.checked)} /><span>勾选完成后隐藏该条</span></label><label className="task-checkbox"><input type="checkbox" checked={settings.showMonthTasks} onChange={event => void persistSetting('showMonthTasks', event.target.checked)} /><span>月视图日期下列出任务</span></label></div>
      <div className="task-setting-section"><h3>导出计划</h3><div className="task-export-actions"><button type="button" onClick={() => void downloadTasks('json')}>JSON</button><button type="button" onClick={() => void downloadTasks('csv')}>CSV</button><button type="button" onClick={() => void downloadTasks('ics')}>日历 .ics</button></div></div>
      <div className="dialog-actions"><button className="button-primary" type="button" onClick={() => setSettingsOpen(false)}>完成</button></div>
    </section></div>}

    {punch && <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-label="任务打卡"><h2>任务打卡 · {punch.title}</h2><label>完成比例：{percentage}%<input aria-label="完成比例" type="range" min="0" max="100" step="1" value={percentage} onChange={event => setPercentage(Number(event.target.value))} /></label><p className="muted-small">只记录完成情况，不再计算金币。</p>{error && <p role="alert" className="error">{error}</p>}<div className="dialog-actions"><button type="button" className="button-primary" onClick={() => void attempt(async () => { await settleTask(punch.id, percentage); setPunch(null) })}>确认打卡</button><button type="button" className="button-secondary" onClick={() => setPunch(null)}>返回</button></div></section></div>}

    {schedule && <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-label="调整后续重复"><h2>调整“{schedule.title}”后续安排</h2><p className="muted-small">已结算的历史记录会保留。</p><label>生效日期<input aria-label="生效日期" type="date" min={localDateKey(new Date(nextMidnight(today())))} value={scheduleFrom} onChange={event => setScheduleFrom(event.target.value)} /></label><label>后续重复<select aria-label="后续重复" value={scheduleRepeat} onChange={event => setScheduleRepeat(event.target.value as 'daily' | 'weekly')}><option value="daily">每天</option><option value="weekly">每周</option></select></label>{error && <p role="alert" className="error">{error}</p>}<div className="dialog-actions"><button className="button-primary" onClick={() => void attempt(async () => { await changeRepeat(schedule.templateId, scheduleRepeat, scheduleFrom); setSchedule(null) })}>保存后续规则</button><button className="button-secondary" onClick={() => setSchedule(null)}>返回</button></div></section></div>}
  </div>
}

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { localDateKey } from '../domain/rules'
import { saveSetting, setting } from '../db/database'

export type LifeViewMode = 'day' | 'week' | 'month'
type TextTone = 'light' | 'dark'
export type LifeCalendarSettingsScope = 'memo' | 'food' | 'fun' | 'badminton'
type CalendarSettingName = 'Width' | 'Scale' | 'Opacity' | 'Blur' | 'TextTone' | 'HideCompleted' | 'ShowMonthTasks'

type CalendarSettings = {
  width: number
  scale: number
  opacity: number
  blur: number
  textTone: TextTone
  hideCompleted: boolean
  showMonthTasks: boolean
}

const defaultSettings: CalendarSettings = {
  width: 1120,
  scale: 100,
  opacity: 78,
  blur: 26,
  textTone: 'light',
  hideCompleted: false,
  showMonthTasks: true,
}

const calendarSettingKey = (scope: LifeCalendarSettingsScope, name: CalendarSettingName) => `${scope}Calendar${name}`

export const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const shortWeekdayNames = ['一', '二', '三', '四', '五', '六', '日']

export const todayKey = () => localDateKey(new Date())

export function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function dateKey(value: Date) {
  return localDateKey(value)
}

export function shiftDate(value: string, amount: number) {
  const next = parseDate(value)
  next.setDate(next.getDate() + amount)
  return dateKey(next)
}

export function mondayOf(value: string) {
  const date = parseDate(value)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return dateKey(date)
}

export function datesFrom(start: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftDate(start, index))
}

export function monthGridStart(value: string) {
  const first = parseDate(`${value.slice(0, 7)}-01`)
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return dateKey(first)
}

export function monthRange(value: string) {
  const start = monthGridStart(value)
  return { start, end: shiftDate(start, 41) }
}

export function rangeFor(value: string, mode: LifeViewMode) {
  if (mode === 'day') return { start: value, end: value }
  if (mode === 'week') {
    const start = mondayOf(value)
    return { start, end: shiftDate(start, 6) }
  }
  return monthRange(value)
}

export function fullDateLabel(value: string) {
  const date = parseDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function monthLabel(value: string) {
  const date = parseDate(value)
  return `${date.getMonth() + 1}月`
}

export function yearMonthLabel(value: string) {
  const date = parseDate(value)
  return `${date.getFullYear()}年 · ${date.getMonth() + 1}月`
}

export function daySubtitle(value: string) {
  const date = parseDate(value)
  return `${date.getFullYear()}年 · ${weekdayNames[date.getDay()]}`
}

const settingNumber = (value: string | number | boolean | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const settingBoolean = (value: string | number | boolean | undefined, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

export function LifeCalendarShell({
  title,
  subtitle,
  date,
  mode,
  onDateChange,
  onModeChange,
  calendarLabel,
  settingsScope,
  dateInputLabel = '查看日期',
  children,
  actions,
}: {
  title: string
  subtitle: string
  date: string
  mode: LifeViewMode
  onDateChange: (date: string) => void
  onModeChange: (mode: LifeViewMode) => void
  calendarLabel: string
  settingsScope: LifeCalendarSettingsScope
  dateInputLabel?: string
  children: ReactNode
  actions?: ReactNode
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<CalendarSettings>(defaultSettings)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const range = rangeFor(date, mode)

  useEffect(() => {
    let active = true
    void Promise.all([
      setting(calendarSettingKey(settingsScope, 'Width')),
      setting(calendarSettingKey(settingsScope, 'Scale')),
      setting(calendarSettingKey(settingsScope, 'Opacity')),
      setting(calendarSettingKey(settingsScope, 'Blur')),
      setting(calendarSettingKey(settingsScope, 'TextTone')),
      setting(calendarSettingKey(settingsScope, 'HideCompleted')),
      setting(calendarSettingKey(settingsScope, 'ShowMonthTasks')),
    ]).then(([width, scale, opacity, blur, textTone, hideCompleted, showMonthTasks]) => {
      if (!active) return
      setSettings({
        width: settingNumber(width, defaultSettings.width),
        scale: settingNumber(scale, defaultSettings.scale),
        opacity: settingNumber(opacity, defaultSettings.opacity),
        blur: settingNumber(blur, defaultSettings.blur),
        textTone: textTone === 'dark' ? 'dark' : 'light',
        hideCompleted: settingBoolean(hideCompleted, defaultSettings.hideCompleted),
        showMonthTasks: settingBoolean(showMonthTasks, defaultSettings.showMonthTasks),
      })
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [settingsScope])

  const moveDate = (amount: number) => {
    if (mode === 'month') {
      const next = parseDate(`${date.slice(0, 7)}-01`)
      next.setMonth(next.getMonth() + amount)
      onDateChange(dateKey(next))
      return
    }
    onDateChange(shiftDate(date, mode === 'week' ? amount * 7 : amount))
  }
  const glassStrength = Math.min(1, Math.max(0, settings.blur / 48))
  const glassFill = Math.min(1, Math.max(0, settings.opacity / 100))
  const appStyle = {
    '--task-calendar-width': `${settings.width}px`,
    '--task-calendar-scale': String(settings.scale / 100),
    '--task-calendar-opacity': String(glassFill),
    '--task-calendar-blur': `${settings.blur}px`,
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
  async function persistSetting<K extends keyof CalendarSettings>(key: K, value: CalendarSettings[K]) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    const dbKey = ({
      width: calendarSettingKey(settingsScope, 'Width'),
      scale: calendarSettingKey(settingsScope, 'Scale'),
      opacity: calendarSettingKey(settingsScope, 'Opacity'),
      blur: calendarSettingKey(settingsScope, 'Blur'),
      textTone: calendarSettingKey(settingsScope, 'TextTone'),
      hideCompleted: calendarSettingKey(settingsScope, 'HideCompleted'),
      showMonthTasks: calendarSettingKey(settingsScope, 'ShowMonthTasks'),
    } as const)[key]
    try {
      await saveSetting(dbKey, value)
      setMessage('界面设置已保存')
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  async function changeMode(next: LifeViewMode) {
    onModeChange(next)
  }
  const modeLabel = mode === 'month'
    ? `${yearMonthLabel(date)} · 点击日期查看当天`
    : mode === 'week'
      ? `${yearMonthLabel(date)} · ${fullDateLabel(range.start)}–${fullDateLabel(range.end)}`
      : `${daySubtitle(date)}`

  return <div className={`tasks-page tasks-text-${settings.textTone} life-calendar-page ${settings.showMonthTasks ? '' : 'life-calendar-hide-month-items'}`} style={appStyle}>
    <h1 className="tasks-accessible-heading">{title}</h1>
    <div className="tasks-calendar-toolbar">
      <div className="tasks-calendar-title">
        <button type="button" className="tasks-round-button" aria-label="上一个时间段" onClick={() => moveDate(-1)}>‹</button>
        <div>
          <h2>{mode === 'day' ? fullDateLabel(date) : monthLabel(date)}</h2>
          <p>{subtitle} · {modeLabel}</p>
        </div>
        <button type="button" className="tasks-round-button" aria-label="下一个时间段" onClick={() => moveDate(1)}>›</button>
        <input className="tasks-date-input" aria-label={dateInputLabel} type="date" value={date}
          onChange={event => { if (event.target.value) onDateChange(event.target.value) }} />
      </div>
      <div className="tasks-calendar-actions">
        <div className="tasks-view-switch" role="group" aria-label="日周月视图">
          {(['day', 'week', 'month'] as const).map(item => <button key={item} type="button"
            className={mode === item ? 'active' : ''} aria-pressed={mode === item} onClick={() => void changeMode(item)}>
            {item === 'day' ? '日' : item === 'week' ? '周' : '月'}
          </button>)}
        </div>
        <span className="tasks-sync-dot" title="本地数据已同步" aria-label="本地数据已同步" />
        {actions}
        <button type="button" className="tasks-settings-button" aria-label="界面设置" title="界面设置" onClick={() => setSettingsOpen(true)}>⚙</button>
      </div>
    </div>
    <div className={`tasks-calendar-surface view-${mode}`} role="group" aria-label={calendarLabel}>
      {children}
    </div>
    {message && <p role="status" className="feedback">{message}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {settingsOpen && <div className="dialog-backdrop" role="presentation"><section className="dialog task-settings-dialog" role="dialog" aria-modal="true" aria-label="界面设置">
      <div className="dialog-header"><div><h2>界面设置</h2><p className="muted-small">调整日历的尺寸、透明度和显示方式。</p></div><button className="button-secondary dialog-close" type="button" aria-label="关闭界面设置" onClick={() => setSettingsOpen(false)}>×</button></div>
      <div className="task-setting-section"><h3>尺寸</h3><label>宽度 <output>{settings.width}px</output><input aria-label="宽度" type="range" min="760" max="1300" step="10" value={settings.width} onChange={event => void persistSetting('width', Number(event.target.value))} /></label><label>整体缩放 <output>{settings.scale}%</output><input aria-label="整体缩放" type="range" min="80" max="120" step="5" value={settings.scale} onChange={event => void persistSetting('scale', Number(event.target.value))} /></label></div>
      <div className="task-setting-section"><h3>外观</h3><label>透明度 <output>{settings.opacity}%</output><input aria-label="透明度" type="range" min="45" max="100" step="1" value={settings.opacity} onChange={event => void persistSetting('opacity', Number(event.target.value))} /></label><label>毛玻璃 <output>{settings.blur}px</output><input aria-label="毛玻璃" type="range" min="0" max="48" step="1" value={settings.blur} onChange={event => void persistSetting('blur', Number(event.target.value))} /></label><div className="task-text-tone"><span>文字颜色</span><button type="button" className={settings.textTone === 'light' ? 'active' : ''} onClick={() => void persistSetting('textTone', 'light')}>亮色字</button><button type="button" className={settings.textTone === 'dark' ? 'active' : ''} onClick={() => void persistSetting('textTone', 'dark')}>暗色字</button></div></div>
      <div className="task-setting-section"><h3>显示</h3><label className="task-checkbox"><input type="checkbox" checked={settings.hideCompleted} onChange={event => void persistSetting('hideCompleted', event.target.checked)} /><span>勾选完成后隐藏该条</span></label><label className="task-checkbox"><input type="checkbox" checked={settings.showMonthTasks} onChange={event => void persistSetting('showMonthTasks', event.target.checked)} /><span>月视图日期下列出任务</span></label></div>
      <div className="dialog-actions"><button className="button-primary" type="button" onClick={() => setSettingsOpen(false)}>完成</button></div>
    </section></div>}
  </div>
}

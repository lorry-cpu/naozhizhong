import { useCallback, useEffect, useState } from 'react'
import { all, watchChanges } from '../db/database'
import type { TaskInstance, TaskTemplate, TimerRecord } from '../db/types'
import { localDateKey, nextMidnight, payoutFor, rewardCap } from '../domain/rules'
import { cancelTask, changeRepeat, createTask, elapsedMs, pauseTimer, startTimer, stopRepeating, tasksForDate, updateTask } from '../domain/tasks'
import { settleTask } from '../domain/coins'

const today = () => localDateKey(new Date())
const initialForm = (date: string) => ({
  title: '', startDate: date, time: '09:00', minutes: 30,
  difficulty: 'easy' as TaskTemplate['difficulty'], repeat: 'none' as TaskTemplate['repeat'],
})
type Form = ReturnType<typeof initialForm>
const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' }

export function TasksPage() {
  const [date, setDate] = useState(today())
  const [items, setItems] = useState<TaskInstance[]>([])
  const [timers, setTimers] = useState<Record<string, TimerRecord>>({})
  const [templates, setTemplates] = useState<Record<string, TaskTemplate>>({})
  const [form, setForm] = useState<Form>(initialForm(today()))
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [punch, setPunch] = useState<TaskInstance | null>(null)
  const [schedule, setSchedule] = useState<TaskInstance | null>(null)
  const [scheduleFrom, setScheduleFrom] = useState('')
  const [scheduleRepeat, setScheduleRepeat] = useState<'daily' | 'weekly'>('daily')
  const [percentage, setPercentage] = useState(100)
  const [clock, setClock] = useState(Date.now())
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const next = await tasksForDate(date)
      const [recorded, source] = await Promise.all([all('timers'), all('templates')])
      setItems(next)
      setTimers(Object.fromEntries(recorded.map(timer => [timer.id, timer])))
      setTemplates(Object.fromEntries(source.map(template => [template.id, template])))
    } catch (reason) { setError(String(reason)) }
  }, [date])
  useEffect(() => {
    void load()
    return watchChanges(() => void load())
  }, [load])
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const preview = Number.isSafeInteger(form.minutes) && form.minutes > 0
    ? rewardCap(form.minutes, form.difficulty) : null
  async function attempt(action: () => Promise<unknown>) {
    try { setError(''); await action(); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (form.startDate < today() && !editing) { setError('不能新建已经过期的任务'); return }
    await attempt(async () => {
      if (editing) {
        await updateTask(editing, { title: form.title, time: form.time, minutes: form.minutes, difficulty: form.difficulty })
      } else await createTask(form)
      setDate(form.startDate)
      setForm(initialForm(form.startDate))
      setEditing(null)
      setFormOpen(false)
    })
  }
  function edit(item: TaskInstance) {
    setForm({ title: item.title, startDate: item.date, time: item.time, minutes: item.minutes, difficulty: item.difficulty, repeat: 'none' })
    setEditing(item.id)
    setFormOpen(true)
  }
  return <>
    <h1>今日计划</h1>
    <p className="subtitle">为任务安排时间，按实际完成比例打卡。</p>
    <div className="toolbar">
      <label>查看日期 <input aria-label="查看日期" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" className="button-primary" onClick={() => {
        setForm(initialForm(date < today() ? today() : date)); setEditing(null); setFormOpen(true)
      }}>＋ 新建任务</button>
    </div>
    {formOpen && <section className="panel">
      <h2>{editing ? '修改任务' : '新建计划任务'}</h2>
      <form onSubmit={event => void submit(event)} className="form-grid">
        <label className="wide">任务名称<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="例如：阅读专业资料" /></label>
        <label>计划日期<input type="date" required min={editing ? undefined : today()} disabled={Boolean(editing)}
          value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></label>
        <label>开始时间<input type="time" required value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label>
        <label>预计分钟<input type="number" required min="1" max="1440" value={form.minutes}
          onChange={event => setForm({ ...form, minutes: Number(event.target.value) })} /></label>
        <label>难度<select value={form.difficulty} onChange={event => setForm({ ...form, difficulty: event.target.value as Form['difficulty'] })}>
          <option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option>
        </select></label>
        {!editing && <label>重复<select value={form.repeat} onChange={event => setForm({ ...form, repeat: event.target.value as Form['repeat'] })}>
          <option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option>
        </select></label>}
        <div className="wide">完成 100% 可获得 <strong>{preview ?? '—'} 金币</strong><p className="muted-small">按难度和预计分钟计算，打卡时按完成比例结算。</p></div>
        <div className="button-row wide"><button className="button-primary" type="submit">保存任务</button>
          <button className="button-secondary" type="button" onClick={() => setFormOpen(false)}>取消</button></div>
      </form>
    </section>}
    <section className="panel">
      <h2>{date} · 时间安排</h2>
      {items.length === 0 && <p className="subtitle">这一天还没有计划，点击「新建任务」开始。</p>}
      {items.map(item => {
        const timer = timers[item.id]
        const elapsed = Math.floor(elapsedMs(timer, clock) / 1000)
        const formatted = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
        return <div className="task-row" key={item.id}>
          <div className="task-time">{item.time}</div>
          <div className="task-detail"><strong>{item.title}</strong>
            <small>{difficultyLabels[item.difficulty]} · 预计 {item.minutes} 分钟 · 满额 {rewardCap(item.minutes, item.difficulty)} 金币 · 已计时 {formatted}</small>
            {item.status !== 'pending' && <small>{item.status === 'cancelled' ? '已取消' : `已结算 ${item.percentage}% · ${item.payout! >= 0 ? '＋' : ''}${item.payout} 金币`}</small>}
          </div>
          {item.status === 'pending' && <div className="button-row">
            <button type="button" className="button-secondary" onClick={() => void attempt(() => timer?.startedAt !== null && timer?.startedAt !== undefined ? pauseTimer(item.id) : startTimer(item.id))}>
              {timer?.startedAt !== null && timer?.startedAt !== undefined ? '暂停计时' : elapsed > 0 ? '继续计时' : '开始计时'}
            </button>
            <button type="button" className="button-primary" onClick={() => { setPunch(item); setPercentage(100) }}>打卡</button>
            <button type="button" className="button-link" onClick={() => edit(item)}>编辑</button>
            <button type="button" className="button-link" onClick={() => {
              if (window.confirm(`取消「${item.title}」这一天的任务？`)) void attempt(() => cancelTask(item.id))
            }}>取消</button>
            {templates[item.templateId]?.repeat !== 'none' && <button type="button" className="button-link" onClick={() => {
              setSchedule(item)
              setScheduleFrom(localDateKey(new Date(nextMidnight(item.date))))
              setScheduleRepeat(templates[item.templateId]?.repeat === 'weekly' ? 'weekly' : 'daily')
            }}>调整后续重复</button>}
            {templates[item.templateId]?.repeat !== 'none' && <button type="button" className="button-link" onClick={() => {
              if (window.confirm(`停止「${item.title}」之后的重复安排？`)) void attempt(() => stopRepeating(item.templateId))
            }}>停止重复</button>}
          </div>}
        </div>
      })}
    </section>
    {punch && <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-label="任务打卡">
        <h2>任务打卡 · {punch.title}</h2>
        <label>完成比例：{percentage}%<input type="range" min="0" max="100" step="1" value={percentage}
          onChange={event => setPercentage(Number(event.target.value))} /></label>
        <p>预计结算：{payoutFor(rewardCap(punch.minutes, punch.difficulty), percentage)} 金币</p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="button-row"><button type="button" className="button-primary" onClick={() => void attempt(async () => {
          await settleTask(punch.id, percentage); setPunch(null)
        })}>确认打卡</button>
          <button type="button" className="button-secondary" onClick={() => setPunch(null)}>返回</button></div>
      </section>
    </div>}
    {schedule && <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-label="调整后续重复">
      <h2>调整「{schedule.title}」后续安排</h2>
      <p className="muted-small">从所选日期开始采用新规则，已结算的历史记录保留。每周重复以该日期的星期为准。</p>
      <label>生效日期<input aria-label="生效日期" type="date" min={localDateKey(new Date(nextMidnight(today())))} value={scheduleFrom} onChange={e => setScheduleFrom(e.target.value)} /></label>
      <label>后续重复<select aria-label="后续重复" value={scheduleRepeat} onChange={e => setScheduleRepeat(e.target.value as 'daily' | 'weekly')}>
        <option value="daily">每天</option><option value="weekly">每周</option></select></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="button-row"><button className="button-primary" onClick={() => void attempt(async () => {
        await changeRepeat(schedule.templateId, scheduleRepeat, scheduleFrom); setSchedule(null)
      })}>保存后续规则</button><button className="button-secondary" onClick={() => setSchedule(null)}>返回</button></div>
    </section></div>}
    {error && <p role="alert" className="error">{error}</p>}
  </>
}

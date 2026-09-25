import { useEffect, useState } from 'react'
import { all, remove, save, watchChanges } from '../db/database'
import type { Entertainment } from '../db/types'
import { mondayOf, validateEntertainment } from '../domain/life'
import { localDateKey } from '../domain/rules'
import { Calendar } from '../components/Calendar'

const fresh = (date: string): Entertainment => ({
  id: crypto.randomUUID(), date, category: '游戏', title: '',
  plannedTime: '19:00', plannedMinutes: 60, actualMinutes: null,
})
export function FunPage() {
  const [date, setDate] = useState(localDateKey(new Date()))
  const [rows, setRows] = useState<Entertainment[]>([])
  const [form, setForm] = useState<Entertainment>(() => fresh(localDateKey(new Date())))
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => void all('entertainment').then(setRows).catch(e => setError(String(e)))
    load(); return watchChanges(load)
  }, [])
  const daily = rows.filter(r => r.date === date).sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))
  const week = mondayOf(date)
  const weekly = rows.filter(r => mondayOf(r.date) === week)
  const byCategory = weekly.reduce<Record<string, Entertainment[]>>((groups, row) => {
    (groups[row.category] ??= []).push(row)
    return groups
  }, {})
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      validateEntertainment(form)
      await save('entertainment', { ...form, title: form.title.trim(), category: form.category.trim() })
      setError(''); setDate(form.date); setEditing(false); setForm(fresh(form.date))
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  return <>
    <h1>游戏娱乐</h1><p className="subtitle">先安排娱乐时间，再单独记录实际玩了多久。</p>
    <section className="panel calendar-panel"><Calendar value={date} onChange={setDate}
      entries={rows.map(row => ({ date: row.date, count: 1 }))} ariaLabel="娱乐日历" /></section>
    <section className="panel"><h2>{editing ? '修改娱乐记录' : '安排娱乐'}</h2>
      <form className="form-grid" onSubmit={e => void submit(e)}>
        <label>日期<input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <label>类别<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          {['游戏','电影','阅读','其他'].map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="wide">娱乐项目<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label>计划开始<input required type="time" value={form.plannedTime} onChange={e => setForm({ ...form, plannedTime: e.target.value })} /></label>
        <label>计划时长（分钟）<input type="number" min="1" max="1440" required value={form.plannedMinutes}
          onChange={e => setForm({ ...form, plannedMinutes: Number(e.target.value) })} /></label>
        <label className="wide">实际时长（分钟，可不填）<input aria-label="实际时长" type="number" min="0" max="1440" value={form.actualMinutes ?? ''}
          onChange={e => setForm({ ...form, actualMinutes: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <div className="button-row wide"><button className="button-primary">保存娱乐记录</button>{editing && <button type="button" className="button-secondary" onClick={() => { setEditing(false); setForm(fresh(date)) }}>取消修改</button>}</div>
      </form>
    </section>
    <section className="panel"><h2>{date} 的娱乐安排</h2>
      {daily.length === 0 && <p className="subtitle">当天还没有娱乐安排。</p>}
      {daily.map(row => <div className="history-row" key={row.id}><span>{row.category} · {row.title} · {row.plannedTime} 计划 {row.plannedMinutes} 分钟 · 实际 {row.actualMinutes === null ? '未记录' : `${row.actualMinutes} 分钟`}</span>
        <div className="button-row"><button className="button-link" onClick={() => { setForm(row); setEditing(true) }}>编辑与记录实际</button>
          <button className="button-link" onClick={() => { if (window.confirm('删除这条娱乐记录？')) void remove('entertainment', row.id).catch(e => setError(String(e))) }}>删除</button></div></div>)}
    </section>
    <section className="panel"><h2>本周娱乐 · 自 {week} 起</h2>
      <p>计划 {weekly.reduce((sum, r) => sum + r.plannedMinutes, 0)} 分钟 · 实际 {weekly.reduce((sum, r) => sum + (r.actualMinutes ?? 0), 0)} 分钟</p>
      {Object.entries(byCategory).map(([category, list]) =>
        <p key={category}>{category}：{list.length} 次 · 实际 {list.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0)} 分钟</p>)}
    </section>
    {error && <p role="alert" className="error">{error}</p>}
  </>
}

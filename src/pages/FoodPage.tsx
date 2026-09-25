import { useEffect, useState } from 'react'
import { all, remove, save, watchChanges } from '../db/database'
import type { Meal } from '../db/types'
import { mondayOf, validateMeal } from '../domain/life'
import { localDateKey } from '../domain/rules'
import { Calendar } from '../components/Calendar'

const fresh = (date: string): Meal => ({ id: crypto.randomUUID(), date, kind: '早餐', time: '08:00', food: '', spent: null })
export function FoodPage() {
  const [date, setDate] = useState(localDateKey(new Date()))
  const [rows, setRows] = useState<Meal[]>([])
  const [form, setForm] = useState<Meal>(() => fresh(localDateKey(new Date())))
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => void all('meals').then(setRows).catch(e => setError(String(e)))
    load(); return watchChanges(load)
  }, [])
  const daily = rows.filter(r => r.date === date).sort((a, b) => a.time.localeCompare(b.time))
  const week = mondayOf(date)
  const weekly = rows.filter(r => mondayOf(r.date) === week)
  const spent = (list: Meal[]) => list.reduce((sum, row) => sum + (row.spent ?? 0), 0).toFixed(2)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    try {
      validateMeal(form); await save('meals', { ...form, kind: form.kind.trim(), food: form.food.trim() })
      setError(''); setEditing(false); setDate(form.date); setForm(fresh(form.date))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return <>
    <h1>饮食计划</h1><p className="subtitle">按餐次安排吃什么、几点吃，并记录实际花费。</p>
    <section className="panel calendar-panel"><Calendar value={date} onChange={setDate}
      entries={rows.map(row => ({ date: row.date, count: 1 }))} ariaLabel="饮食日历" /></section>
    <section className="panel"><h2>{editing ? '修改餐次' : '添加餐次'}</h2>
      <form className="form-grid" onSubmit={e => void submit(e)}>
        <label>用餐日期<input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <label>餐次<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
          {['早餐','午餐','晚餐','加餐'].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>用餐时间<input required type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></label>
        <label>实际花费（元，可不填）<input aria-label="实际花费" type="number" min="0" step="0.01" value={form.spent ?? ''}
          onChange={e => setForm({ ...form, spent: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label className="wide">吃什么<input required value={form.food} onChange={e => setForm({ ...form, food: e.target.value })} /></label>
        <div className="button-row wide"><button className="button-primary">保存餐次</button>{editing && <button type="button" className="button-secondary" onClick={() => { setEditing(false); setForm(fresh(date)) }}>取消修改</button>}</div>
      </form>
    </section>
    <section className="panel"><h2>{date} 的餐次 · 已记录花费 ¥{spent(daily)}</h2>
      {daily.length === 0 && <p className="subtitle">当天还没有餐次安排。</p>}
      {daily.map(row => <div className="history-row" key={row.id}><span>{row.time} · {row.kind} · {row.food} · {row.spent === null ? '未记录花费' : `¥${row.spent.toFixed(2)}`}</span>
        <div className="button-row"><button className="button-link" onClick={() => { setForm(row); setEditing(true) }}>编辑</button>
          <button className="button-link" onClick={() => { if (window.confirm('删除这条餐次记录？')) void remove('meals', row.id).catch(e => setError(String(e))) }}>删除</button></div></div>)}
    </section>
    <section className="panel"><h2>本周已记录花费</h2><p>自 {week} 起：¥{spent(weekly)} · {weekly.length} 餐</p></section>
    {error && <p role="alert" className="error">{error}</p>}
  </>
}

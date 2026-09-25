import { useEffect, useState } from 'react'
import { all, remove, save, watchChanges } from '../db/database'
import type { Badminton } from '../db/types'
import { badmintonMinutes, validateBadminton } from '../domain/life'
import { localDateKey } from '../domain/rules'
import { Calendar } from '../components/Calendar'

const fresh = (): Badminton => ({
  id: crypto.randomUUID(), date: localDateKey(new Date()), start: '18:00', end: '19:00',
  balls: 0, training: '', feeling: '',
})
export function BadmintonPage() {
  const [date, setDate] = useState(localDateKey(new Date()))
  const [rows, setRows] = useState<Badminton[]>([])
  const [form, setForm] = useState<Badminton>(fresh)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => void all('badminton').then(setRows).catch(e => setError(String(e)))
    load(); return watchChanges(load)
  }, [])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      validateBadminton(form)
      await save('badminton', { ...form, training: form.training.trim(), feeling: form.feeling.trim() })
      setEditing(false); setForm(fresh()); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const sorted = [...rows].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
  const daily = sorted.filter(row => row.date === date)
  return <>
    <h1>羽毛球</h1><p className="subtitle">记录每次打球的时间、用球、训练内容与感受。</p>
    <section className="panel calendar-panel"><Calendar value={date} onChange={setDate}
      entries={rows.map(row => ({ date: row.date, count: 1 }))} ariaLabel="羽毛球日历" /></section>
    <section className="panel"><h2>{editing ? '修改打球记录' : '记录一次打球'}</h2>
      <form className="form-grid" onSubmit={e => void submit(e)}>
        <label>打球日期<input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <label>消耗球数<input aria-label="消耗球数" type="number" min="0" step="1" required value={form.balls} onChange={e => setForm({ ...form, balls: Number(e.target.value) })} /></label>
        <label>开始时间<input type="time" required value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} /></label>
        <label>结束时间<input type="time" required value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} /></label>
        <label className="wide">训练内容<textarea required value={form.training} onChange={e => setForm({ ...form, training: e.target.value })} /></label>
        <label className="wide">个人感受<textarea required value={form.feeling} onChange={e => setForm({ ...form, feeling: e.target.value })} /></label>
        <div className="button-row wide"><button className="button-primary">保存打球记录</button>{editing && <button type="button" className="button-secondary" onClick={() => { setForm(fresh()); setEditing(false) }}>取消修改</button>}</div>
      </form>
    </section>
    <section className="panel"><h2>累计记录</h2>
      <p>{rows.length} 次 · {rows.reduce((sum, r) => sum + badmintonMinutes(r), 0)} 分钟 · 消耗 {rows.reduce((sum, r) => sum + r.balls, 0)} 个球</p>
    </section>
    <section className="panel"><h2>{date} 的打球记录</h2>
      {daily.length === 0 && <p className="subtitle">当天还没有打球记录。</p>}
      {daily.map(row => <div className="history-row" key={row.id}><span><strong>{row.date} · {row.start}—{row.end}</strong><br />
        用球 {row.balls} 个 · {badmintonMinutes(row)} 分钟<br />训练：{row.training}<br />感受：{row.feeling}</span>
        <div className="button-row"><button className="button-link" onClick={() => { setForm(row); setEditing(true) }}>编辑</button>
          <button className="button-link" onClick={() => { if (window.confirm('删除这次打球记录？')) void remove('badminton', row.id).catch(e => setError(String(e))) }}>删除</button></div></div>)}
    </section>
    <section className="panel"><h2>全部打球历史</h2><p>{sorted.length ? `共 ${sorted.length} 次记录` : '还没有打球记录。'}</p></section>
    {error && <p role="alert" className="error">{error}</p>}
  </>
}

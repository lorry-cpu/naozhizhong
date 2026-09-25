import { useEffect, useState } from 'react'
import { all, watchChanges } from '../db/database'
import type { Badminton, Entertainment, Meal, TaskInstance } from '../db/types'
import { badmintonMinutes } from '../domain/life'
import { localDateKey } from '../domain/rules'
import type { PageId } from '../app/App'

export function HomePage({ memo, onMemo, onSave, navigate, coins }: {
  memo: string; onMemo: (text: string) => void; onSave: () => void
  navigate: (page: PageId) => void; coins: number
}) {
  const [tasks, setTasks] = useState<TaskInstance[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [fun, setFun] = useState<Entertainment[]>([])
  const [games, setGames] = useState<Badminton[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => {
      void Promise.all([all('occurrences'), all('meals'), all('entertainment'), all('badminton')])
        .then(([t, m, f, b]) => { setTasks(t); setMeals(m); setFun(f); setGames(b) }).catch(e => setError(String(e)))
    }
    load()
    const interval = window.setInterval(load, 30_000)
    const unwatch = watchChanges(load)
    return () => { unwatch(); window.clearInterval(interval) }
  }, [])
  const today = localDateKey(new Date())
  const todaysTasks = tasks.filter(row => row.date === today && row.status !== 'cancelled')
  const done = todaysTasks.filter(row => row.status === 'settled').length
  const todaysMeals = meals.filter(row => row.date === today).sort((a, b) => a.time.localeCompare(b.time))
  const todaysFun = fun.filter(row => row.date === today).sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))
  const latest = [...games].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))[0]
  return <>
    <h1>首页总览</h1><p className="subtitle">{today} · 看看今天的安排。</p>
    <div className="card-grid">
      <section className="panel summary-card"><h2>金币余额</h2><strong>{coins} 金币</strong><p><button className="button-link" onClick={() => navigate('coins')}>查看明细与风格 →</button></p></section>
      <section className="panel summary-card"><h2>今日计划</h2><strong>{done} / {todaysTasks.length} 项已结算</strong>
        <p>{todaysTasks.find(row => row.status === 'pending')?.title ?? '当前没有待打卡任务'}</p>
        <button className="button-link" onClick={() => navigate('tasks')}>查看或新建任务 →</button></section>
    </div>
    <section className="panel"><h2>快速备忘</h2><label htmlFor="quick-memo">随手记下</label>
      <textarea id="quick-memo" value={memo} onChange={e => onMemo(e.target.value)} placeholder="比如：买球、补牛奶…" />
      <button className="button-primary" onClick={onSave}>保存备忘</button></section>
    <div className="card-grid">
      <section className="panel"><h2>今日饮食</h2>
        <p>{todaysMeals.length ? todaysMeals.map(row => `${row.time} ${row.kind}：${row.food}`).join('；') : '今天还没有餐次安排'}</p>
        <p>已记录花费 ¥{todaysMeals.reduce((sum, row) => sum + (row.spent ?? 0), 0).toFixed(2)}</p>
        <button className="button-link" onClick={() => navigate('food')}>饮食计划 →</button></section>
      <section className="panel"><h2>游戏娱乐</h2>
        <p>{todaysFun.length ? todaysFun.map(row => `${row.plannedTime} ${row.title}`).join('；') : '今天还没有娱乐安排'}</p>
        <p>实际已记录 {todaysFun.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0)} 分钟</p>
        <button className="button-link" onClick={() => navigate('fun')}>娱乐记录 →</button></section>
      <section className="panel"><h2>羽毛球近况</h2>
        <p>{latest ? `${latest.date} · ${badmintonMinutes(latest)} 分钟 · ${latest.balls} 个球` : '还没有打球记录'}</p>
        <button className="button-link" onClick={() => navigate('badminton')}>打球记录 →</button></section>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
  </>
}

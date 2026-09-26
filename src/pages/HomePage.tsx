import { useEffect, useState } from 'react'
import { all, watchChanges } from '../db/database'
import type { Badminton, Entertainment, Meal, TaskInstance } from '../db/types'
import { badmintonMinutes } from '../domain/life'
import { localDateKey } from '../domain/rules'
import type { PageId } from '../app/App'
import { AppIcon } from '../components/AppIcon'

const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const two = (value: number) => String(value).padStart(2, '0')

export function HomePage({ memo, onMemo, onSave, navigate }: {
  memo: string; onMemo: (text: string) => void; onSave: () => void
  navigate: (page: PageId) => void
}) {
  const [tasks, setTasks] = useState<TaskInstance[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [fun, setFun] = useState<Entertainment[]>([])
  const [games, setGames] = useState<Badminton[]>([])
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
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
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(tick)
  }, [])
  const today = localDateKey(now)
  const todaysTasks = tasks.filter(row => row.date === today && row.status !== 'cancelled')
  const done = todaysTasks.filter(row => row.status === 'settled').length
  const total = todaysTasks.length
  const pendingTask = [...todaysTasks].filter(row => row.status === 'pending').sort((a, b) => a.time.localeCompare(b.time))[0]
  const todaysMeals = meals.filter(row => row.date === today).sort((a, b) => a.time.localeCompare(b.time))
  const todaysFun = fun.filter(row => row.date === today).sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))
  const mealSpent = todaysMeals.reduce((sum, row) => sum + (row.spent ?? 0), 0)
  const funActual = todaysFun.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0)
  const latest = [...games].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))[0]
  const allDone = total > 0 && done === total
  const listedTasks = [...todaysTasks].sort((a, b) => a.time.localeCompare(b.time))
  return <div className="home">
    <div className="home-head">
      <div>
        <h1 className="home-title">首页总览</h1>
        <p className="home-stamp-line">现在 <strong>{two(now.getHours())}:{two(now.getMinutes())}</strong> · {today} {weekNames[now.getDay()]} · 看看今天的安排。</p>
      </div>
    </div>

    <div className="home-layout">
      <section className="home-sheet home-plan">
        <div className="home-art" aria-hidden="true"><img src="/cards/plan.svg" alt="" /></div>
        <div className="home-sheet-head"><h2><span className="home-heading-icon"><AppIcon name="tasks" /></span>今日计划</h2>
          <span className="home-head-note">{done} / {total} 项已结算</span></div>
        <div className="home-plan-body">
          {allDone && total > 0 && <p className="home-plan-done">今日全部完成</p>}
          {listedTasks.length === 0
            ? <div className="home-plan-blank"><span className="home-plan-day" aria-hidden="true">{two(now.getDate())}</span><p className="home-plan-empty">今天还没有安排任务</p></div>
            : <ul className="home-plan-list">
                {listedTasks.map(row => <li key={row.id} className={`home-plan-row ${row.status === 'settled' ? 'is-done' : ''}`}>
                  <span className="home-tick" aria-hidden="true">{row.status === 'settled' ? '✓' : ''}</span>
                  <span className="home-plan-text">
                    <strong>{row.time}</strong> · {row.title}
                  </span>
                </li>)}
              </ul>}
          <div className="button-row">
            <button className="button-link" onClick={() => navigate('tasks')}>{pendingTask ? '去打卡或查看 →' : '查看或新建任务 →'}</button>
          </div>
        </div>
      </section>

      <div className="home-col-side">
        <div className="home-notes">
          <section className="home-sheet home-memo">
            <div className="memo-paper">
              <div className="memo-paper-head">
                <h2>备忘录</h2><time dateTime={today}>{today}</time>
              </div>
              <label htmlFor="quick-memo" className="memo-sr-label">记录今天想到的事情</label>
              <textarea id="quick-memo" value={memo} onChange={e => onMemo(e.target.value)} placeholder="今天想记下什么…" />
              <div className="button-row"><button className="button-primary" onClick={onSave}>保存备忘</button>
                <button className="button-link" onClick={() => navigate('memo')}>查看每天记录 →</button></div>
            </div>
            <svg className="memo-paperclip" viewBox="0 0 76 133" aria-hidden="true" focusable="false">
              <path d="M24 50 34 107c3 19 32 18 29-5L52 22C49-1 16-1 18 23l2 18" />
            </svg>
          </section>

          <section className="home-sheet home-note home-note-food">
            <div className="home-food-copy">
              <h2 className="home-poster-title">今日饮食</h2>
              <div className="home-note-body">
                {todaysMeals.length
                  ? todaysMeals.map(row => <p className="home-line" key={row.id}><strong>{row.time}</strong> {row.kind}：{row.food}</p>)
                  : <p className="home-note-empty">今天还没记饮食，<span className="home-inline-action">去安排一餐 →</span></p>}
                <p className="home-line muted-small">已记录花费 ¥{mealSpent.toFixed(2)}</p>
              </div>
              <button className="button-link" onClick={() => navigate('food')}>饮食计划 →</button>
            </div>
          </section>

          <section className="home-sheet home-note home-note-fun">
            <div className="home-fun-copy">
              <h2 className="home-poster-title">游戏娱乐</h2>
              <div className="home-note-body">
                {todaysFun.length
                  ? todaysFun.map(row => <p className="home-line" key={row.id}><strong>{row.plannedTime}</strong> {row.title}</p>)
                  : <p className="home-note-empty">今天还没安排娱乐，留一点放松时间 →</p>}
                <p className="home-line muted-small">实际已记录 {funActual} 分钟</p>
              </div>
              <button className="button-link" onClick={() => navigate('fun')}>娱乐记录 →</button>
            </div>
          </section>

          <section className="home-sheet home-note home-note-ball">
            <div className="home-sport-copy">
              <h2 className="home-poster-title">运动健康</h2>
              <div className="home-note-body">
                {latest
                  ? <p className="home-line"><strong>{latest.date}</strong> · {badmintonMinutes(latest)} 分钟 · {latest.balls} 个球</p>
                  : <p className="home-note-empty">还没有打球记录，<span className="home-inline-action">打完记一笔 →</span></p>}
              </div>
              <button className="button-link" onClick={() => navigate('badminton')}>打球记录 →</button>
            </div>
          </section>
        </div>
      </div>
    </div>

    {error && <p role="alert" className="error">{error}</p>}
  </div>
}

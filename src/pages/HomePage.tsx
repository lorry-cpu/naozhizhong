import { useEffect, useState, type CSSProperties, type ChangeEvent } from 'react'
import { all, remove, saveSetting, setting, watchChanges } from '../db/database'
import type { Badminton, Entertainment, Meal, TaskInstance } from '../db/types'
import { badmintonMinutes } from '../domain/life'
import { localDateKey } from '../domain/rules'
import type { PageId } from '../app/App'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取图片文件'))
    reader.onerror = () => reject(reader.error || new Error('无法读取图片文件'))
    reader.readAsDataURL(file)
  })
}

export function HomePage({ memo, onMemo, onSave, navigate }: {
  memo: string; onMemo: (text: string) => void; onSave: () => void
  navigate: (page: PageId) => void
}) {
  const [tasks, setTasks] = useState<TaskInstance[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [fun, setFun] = useState<Entertainment[]>([])
  const [games, setGames] = useState<Badminton[]>([])
  const [error, setError] = useState('')
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [wallpaperOpacity, setWallpaperOpacity] = useState(0.35)
  const [wallpaperMessage, setWallpaperMessage] = useState('')
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
    const loadWallpaper = () => {
      void Promise.all([setting('overviewWallpaper'), setting('overviewWallpaperOpacity')])
        .then(([savedWallpaper, savedOpacity]) => {
          setWallpaper(typeof savedWallpaper === 'string' && savedWallpaper ? savedWallpaper : null)
          if (typeof savedOpacity === 'number' && Number.isFinite(savedOpacity)) {
            setWallpaperOpacity(Math.min(1, Math.max(0, savedOpacity)))
          }
        })
        .catch(e => setWallpaperMessage(`读取壁纸设置失败：${String(e)}`))
    }
    loadWallpaper()
    return watchChanges(loadWallpaper)
  }, [])
  async function importWallpaper(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setWallpaperMessage('请选择图片文件')
      return
    }
    try {
      const dataUrl = await readAsDataUrl(file)
      await saveSetting('overviewWallpaper', dataUrl)
      setWallpaper(dataUrl)
      setWallpaperMessage('壁纸已保存到本机')
    } catch (e) {
      setWallpaperMessage(`壁纸保存失败：${String(e)}`)
    }
  }
  async function updateWallpaperOpacity(value: number) {
    const next = Math.min(1, Math.max(0, value))
    setWallpaperOpacity(next)
    try {
      await saveSetting('overviewWallpaperOpacity', next)
      setWallpaperMessage(`壁纸不透明度已保存：${Math.round(next * 100)}%`)
    } catch (e) {
      setWallpaperMessage(`不透明度保存失败：${String(e)}`)
    }
  }
  async function clearWallpaper() {
    try {
      await remove('settings', 'overviewWallpaper')
      setWallpaper(null)
      setWallpaperMessage('壁纸已清除')
    } catch (e) {
      setWallpaperMessage(`壁纸清除失败：${String(e)}`)
    }
  }
  const today = localDateKey(new Date())
  const todaysTasks = tasks.filter(row => row.date === today && row.status !== 'cancelled')
  const done = todaysTasks.filter(row => row.status === 'settled').length
  const todaysMeals = meals.filter(row => row.date === today).sort((a, b) => a.time.localeCompare(b.time))
  const todaysFun = fun.filter(row => row.date === today).sort((a, b) => a.plannedTime.localeCompare(b.plannedTime))
  const latest = [...games].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))[0]
  const overviewStyle = {
    '--overview-wallpaper': wallpaper ? `url("${wallpaper}")` : 'none',
    '--overview-wallpaper-opacity': String(wallpaperOpacity),
  } as CSSProperties
  return <div className={`overview-page${wallpaper ? ' has-wallpaper' : ''}`} style={overviewStyle}>
    <h1>首页总览</h1><p className="subtitle">{today} · 看看今天的安排。</p>
    <section className="panel overview-wallpaper-settings">
      <h2>总览壁纸</h2>
      <p className="muted-small">从这台电脑选择一张图片，只会应用在首页总览。</p>
      <label htmlFor="overview-wallpaper-file">本地壁纸
        <input id="overview-wallpaper-file" type="file" accept="image/*" onChange={event => void importWallpaper(event)} />
      </label>
      <label htmlFor="overview-wallpaper-opacity">不透明度：{Math.round(wallpaperOpacity * 100)}%
        <input id="overview-wallpaper-opacity" type="range" min="0" max="100" step="5"
          value={Math.round(wallpaperOpacity * 100)}
          onChange={event => void updateWallpaperOpacity(Number(event.target.value) / 100)} />
      </label>
      <div className="button-row">
        <button className="button-secondary" type="button" onClick={() => void clearWallpaper()} disabled={!wallpaper}>清除壁纸</button>
        {wallpaper && <span className="muted-small">已使用本地壁纸</span>}
      </div>
      {wallpaperMessage && <p className="muted-small" aria-live="polite">{wallpaperMessage}</p>}
    </section>
    <div className="card-grid">
      <section className="panel summary-card"><h2>今日计划</h2><strong>{done} / {todaysTasks.length} 项已结算</strong>
        <p>{todaysTasks.find(row => row.status === 'pending')?.title ?? '当前没有待打卡任务'}</p>
        <button className="button-link" onClick={() => navigate('tasks')}>查看或新建任务 →</button></section>
    </div>
    <section className="panel"><h2>备忘录</h2><label htmlFor="quick-memo">记录今天想到的事情</label>
      <textarea id="quick-memo" value={memo} onChange={e => onMemo(e.target.value)} placeholder="比如：买球、补牛奶…" />
      <div className="button-row"><button className="button-primary" onClick={onSave}>保存备忘</button>
        <button className="button-link" onClick={() => navigate('memo')}>查看每天记录 →</button></div></section>
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
  </div>
}

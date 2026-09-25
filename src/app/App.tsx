import { useEffect, useState } from 'react'
import { byId, setting, saveSetting, storageHealth, watchChanges } from '../db/database'
import { nextMidnight, localDateKey, type ThemeId } from '../domain/rules'
import { TasksPage } from '../pages/TasksPage'
import { CoinsPage } from '../pages/CoinsPage'
import { balance, reconcile } from '../domain/coins'
import { FoodPage } from '../pages/FoodPage'
import { FunPage } from '../pages/FunPage'
import { BadmintonPage } from '../pages/BadmintonPage'
import { HomePage } from '../pages/HomePage'
import { SettingsPage } from '../pages/SettingsPage'

export const pages = [
  { id: 'home', title: '首页总览', icon: '⌂' },
  { id: 'tasks', title: '今日计划', icon: '✓' },
  { id: 'food', title: '饮食计划', icon: '♧' },
  { id: 'fun', title: '游戏娱乐', icon: '◈' },
  { id: 'badminton', title: '羽毛球', icon: '◇' },
  { id: 'coins', title: '金币与风格', icon: '●' },
  { id: 'settings', title: '数据与设置', icon: '▥' },
] as const

export type PageId = typeof pages[number]['id']

export function App() {
  const [page, setPage] = useState<PageId>('home')
  const [memo, setMemo] = useState('')
  const [theme, setTheme] = useState<ThemeId>('warm')
  const [message, setMessage] = useState('')
  const [health, setHealth] = useState('正在检查本地存储…')
  const [coins, setCoins] = useState(0)
  const [unlocked, setUnlocked] = useState<ThemeId[]>(['warm'])
  useEffect(() => {
    Promise.all([setting('memo'), setting('theme'), storageHealth()])
      .then(([savedMemo, savedTheme, status]) => {
        setMemo(typeof savedMemo === 'string' ? savedMemo : '')
        if (savedTheme === 'cool' || savedTheme === 'focus') setTheme(savedTheme)
        setHealth(status.writable ? (status.persistent ? '本地存储可用 · 已获得持久存储权限' : '本地存储可用 · 请定期导出备份') : `本地存储不可用：${status.error}`)
      }).catch(error => setHealth(`本地存储不可用：${String(error)}`))
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    async function refresh() {
      try {
        const [value, selected, cool, focus] = await Promise.all([
          balance(), setting('theme'), byId('settings', 'unlocked:cool'), byId('settings', 'unlocked:focus'),
        ])
        setCoins(value)
        setUnlocked(['warm', ...(cool?.value === true ? ['cool' as const] : []), ...(focus?.value === true ? ['focus' as const] : [])])
        if (selected === 'warm' || (selected === 'cool' && cool?.value === true) || (selected === 'focus' && focus?.value === true)) setTheme(selected)
      } catch (error) { setMessage(`读取本地数据失败：${String(error)}`) }
    }
    void refresh()
    return watchChanges(() => void refresh())
  }, [])
  useEffect(() => {
    const run = () => void reconcile().catch(error => setMessage(`到期任务补算失败：${String(error)}`))
    let midnightTimer: number
    const scheduleMidnight = () => {
      window.clearTimeout(midnightTimer)
      midnightTimer = window.setTimeout(() => { run(); scheduleMidnight() },
        Math.max(1, nextMidnight(localDateKey(new Date())) - Date.now()))
    }
    run()
    scheduleMidnight()
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearTimeout(midnightTimer)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [])
  async function persistMemo() {
    try { await saveSetting('memo', memo); setMessage('备忘已保存到本机') }
    catch (error) { setMessage(`备忘保存失败：${String(error)}`) }
  }
  async function changeTheme(next: ThemeId) {
    if (!unlocked.includes(next)) { setMessage('请先在金币页面兑换该风格'); return }
    try { await saveSetting('theme', next); setTheme(next); setMessage('风格已保存') }
    catch (error) { setMessage(`风格保存失败：${String(error)}`) }
  }
  const current = pages.find(item => item.id === page)!
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon">时</span>自己的节奏</div>
        <div className="nav-label">今天与日常</div>
        <nav aria-label="应用导航">
          {pages.map(item => (
            <button key={item.id} type="button" className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)} aria-current={page === item.id ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">只在这台电脑使用<br />数据保存在本机</div>
      </aside>
      <div className="workspace">
        <header className="topbar"><div><strong>{current.title}</strong><small>按自己的节奏安排每一天</small></div><button className="top-balance" type="button" onClick={() => setPage('coins')}>● {coins} 金币</button></header>
        <main className="content" id="main-content">
          {page === 'home' ? <HomePage memo={memo} onMemo={setMemo} onSave={() => void persistMemo()} navigate={setPage} />
            : page === 'settings' ? <SettingsPage health={health} theme={theme} unlocked={unlocked} onTheme={next => void changeTheme(next)} />
            : page === 'tasks' ? <TasksPage /> : page === 'coins' ? <CoinsPage current={theme} onTheme={setTheme} />
            : page === 'food' ? <FoodPage /> : page === 'fun' ? <FunPage /> : page === 'badminton' ? <BadmintonPage /> : null}
          {message && <p role="status" className="feedback">{message}</p>}
        </main>
      </div>
    </div>
  )
}

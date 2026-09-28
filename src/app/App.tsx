import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { byId, remove, setting, saveSetting, storageHealth, watchChanges } from '../db/database'
import { FONTS, nextMidnight, localDateKey, type FontId, type ThemeId } from '../domain/rules'
import { TasksPage } from '../pages/TasksPage'
import { CoinsPage } from '../pages/CoinsPage'
import { balance, reconcile } from '../domain/coins'
import { FoodPage } from '../pages/FoodPage'
import { FunPage } from '../pages/FunPage'
import { BadmintonPage } from '../pages/BadmintonPage'
import { HomePage } from '../pages/HomePage'
import { SettingsPage } from '../pages/SettingsPage'
import { MemoPage } from '../pages/MemoPage'
import { WallpaperDialog } from '../components/WallpaperDialog'
import { PlanArtDialog, defaultPlanArt, normalizePlanArt } from '../components/PlanArtDialog'
import { AppIcon } from '../components/AppIcon'

export const pages = [
  { id: 'home', title: '首页总览', icon: 'clock' },
  { id: 'memo', title: '备忘录', icon: 'memo' },
  { id: 'tasks', title: '今日计划', icon: 'tasks' },
  { id: 'food', title: '饮食计划', icon: 'food' },
  { id: 'fun', title: '游戏娱乐', icon: 'fun' },
  { id: 'badminton', title: '羽毛球', icon: 'badminton' },
  { id: 'coins', title: '金币与风格', icon: 'coins' },
  { id: 'settings', title: '数据与设置', icon: 'settings' },
] as const

export type PageId = typeof pages[number]['id']
const navigationPages = pages.filter(item => item.id !== 'home')

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取图片文件'))
    reader.onerror = () => reject(reader.error || new Error('无法读取图片文件'))
    reader.readAsDataURL(file)
  })
}

export function App() {
  const [page, setPage] = useState<PageId>('home')
  const [memo, setMemo] = useState('')
  const memoEdited = useRef(false)
  const [theme, setTheme] = useState<ThemeId>('warm')
  const [font, setFont] = useState<FontId>('source-han-serif')
  const [message, setMessage] = useState('')
  const [health, setHealth] = useState('正在检查本地存储…')
  const [coins, setCoins] = useState(0)
  const [unlocked, setUnlocked] = useState<ThemeId[]>(['warm'])
  const [unlockedFonts, setUnlockedFonts] = useState<FontId[]>(['source-han-serif'])
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [wallpaperOpacity, setWallpaperOpacity] = useState(0.35)
  const [wallpaperOpen, setWallpaperOpen] = useState(false)
  const [wallpaperMessage, setWallpaperMessage] = useState('')
  const [planArt, setPlanArt] = useState(defaultPlanArt)
  const [planArtOpen, setPlanArtOpen] = useState(false)
  const [planArtMessage, setPlanArtMessage] = useState('')

  useEffect(() => {
    const memoKey = `memo:${localDateKey(new Date())}`
    let active = true
    void Promise.all([setting(memoKey), setting('memo')])
      .then(([savedDailyMemo, savedMemo]) => {
        if (!active) return
        if (!memoEdited.current) setMemo(typeof savedDailyMemo === 'string' ? savedDailyMemo : typeof savedMemo === 'string' ? savedMemo : '')
      })
      .catch(error => {
        if (active) setMessage(`读取备忘失败：${String(error)}`)
      })
    void setting('theme')
      .then(savedTheme => {
        if (active && (savedTheme === 'cool' || savedTheme === 'focus')) setTheme(savedTheme)
      })
      .catch(error => {
        if (active) setMessage(`读取风格失败：${String(error)}`)
      })
    void setting('font')
      .then(savedFont => {
        if (active && FONTS.some(item => item.id === savedFont)) setFont(savedFont as FontId)
      })
      .catch(error => {
        if (active) setMessage(`读取字体失败：${String(error)}`)
      })
    void storageHealth()
      .then(status => {
        if (!active) return
        setHealth(status.writable ? (status.persistent ? '本地存储可用 · 已获得持久存储权限' : '本地存储可用 · 请定期导出备份') : `本地存储不可用：${status.error}`)
      })
      .catch(error => {
        if (active) setHealth(`本地存储不可用：${String(error)}`)
      })
    return () => { active = false }
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
        .catch(error => setWallpaperMessage(`读取壁纸设置失败：${String(error)}`))
    }
    loadWallpaper()
    return watchChanges(loadWallpaper)
  }, [])
  useEffect(() => {
    const loadPlanArt = () => {
      void setting('homePlanArt')
        .then(saved => setPlanArt(normalizePlanArt(saved)))
        .catch(error => setPlanArtMessage(`读取首页插画失败：${String(error)}`))
    }
    loadPlanArt()
    return watchChanges(loadPlanArt)
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { document.documentElement.dataset.font = font }, [font])
  useEffect(() => {
    async function refresh() {
      try {
        const [value, selected, savedFont, cool, focus, ...fontSettings] = await Promise.all([
          balance(), setting('theme'), setting('font'), byId('settings', 'unlocked:cool'), byId('settings', 'unlocked:focus'),
          ...FONTS.filter(item => item.id !== 'source-han-serif').map(item => byId('settings', `unlocked:font:${item.id}`)),
        ])
        setCoins(value)
        setUnlocked(['warm', ...(cool?.value === true ? ['cool' as const] : []), ...(focus?.value === true ? ['focus' as const] : [])])
        if (selected === 'warm' || (selected === 'cool' && cool?.value === true) || (selected === 'focus' && focus?.value === true)) setTheme(selected)
        if (savedFont && FONTS.some(item => item.id === savedFont)) setFont(savedFont as FontId)
        setUnlockedFonts([
          'source-han-serif',
          ...FONTS.filter(item => item.id !== 'source-han-serif')
            .filter((_, index) => fontSettings[index]?.value === true)
            .map(item => item.id),
        ])
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
  function updateMemo(value: string) {
    memoEdited.current = true
    setMemo(value)
  }
  async function persistMemo() {
    try {
      const date = localDateKey(new Date())
      await saveSetting(`memo:${date}`, memo)
      await saveSetting('memo', memo)
      setMessage('备忘已保存到本机')
    }
    catch (error) { setMessage(`备忘保存失败：${String(error)}`) }
  }
  async function changeTheme(next: ThemeId) {
    if (!unlocked.includes(next)) { setMessage('请先在金币页面兑换该风格'); return }
    try { await saveSetting('theme', next); setTheme(next); setMessage('风格已保存') }
    catch (error) { setMessage(`风格保存失败：${String(error)}`) }
  }
  async function changeFont(next: FontId) {
    if (!unlockedFonts.includes(next)) { setMessage('请先在金币页面购买该字体'); return }
    try { await saveSetting('font', next); setFont(next); setMessage('字体已保存') }
    catch (error) { setMessage(`字体保存失败：${String(error)}`) }
  }
  async function importWallpaper(file: File) {
    if (!file.type.startsWith('image/')) {
      setWallpaperMessage('请选择图片文件')
      return
    }
    try {
      const dataUrl = await readAsDataUrl(file)
      await saveSetting('overviewWallpaper', dataUrl)
      setWallpaper(dataUrl)
      setWallpaperMessage('壁纸已保存到本机')
    } catch (error) {
      setWallpaperMessage(`壁纸保存失败：${String(error)}`)
    }
  }
  async function updateWallpaperOpacity(value: number) {
    const next = Math.min(1, Math.max(0, value))
    setWallpaperOpacity(next)
    try {
      await saveSetting('overviewWallpaperOpacity', next)
      setWallpaperMessage(`壁纸不透明度已保存：${Math.round(next * 100)}%`)
    } catch (error) {
      setWallpaperMessage(`不透明度保存失败：${String(error)}`)
    }
  }
  async function clearWallpaper() {
    try {
      await remove('settings', 'overviewWallpaper')
      setWallpaper(null)
      setWallpaperMessage('壁纸已清除')
    } catch (error) {
      setWallpaperMessage(`壁纸清除失败：${String(error)}`)
    }
  }
  async function choosePlanArt(src: string) {
    try {
      await saveSetting('homePlanArt', src)
      setPlanArt(src)
      setPlanArtMessage('已更换插画')
    } catch (error) {
      setPlanArtMessage(`插画保存失败：${String(error)}`)
    }
  }
  async function importPlanArt(file: File) {
    if (!file.type.startsWith('image/')) {
      setPlanArtMessage('请选择图片文件')
      return
    }
    try {
      const dataUrl = await readAsDataUrl(file)
      await saveSetting('homePlanArt', dataUrl)
      setPlanArt(dataUrl)
      setPlanArtMessage('图片已保存到本机')
    } catch (error) {
      setPlanArtMessage(`图片保存失败：${String(error)}`)
    }
  }
  async function resetPlanArt() {
    try {
      await saveSetting('homePlanArt', defaultPlanArt)
      setPlanArt(defaultPlanArt)
      setPlanArtMessage('已恢复默认插画')
    } catch (error) {
      setPlanArtMessage(`恢复失败：${String(error)}`)
    }
  }
  const appStyle = {
    '--app-wallpaper': wallpaper ? `url("${wallpaper}")` : 'none',
    '--app-wallpaper-opacity': String(wallpaperOpacity),
  } as CSSProperties
  return (
    <div className={`app-shell ${page === 'home' ? 'home-active' : ''}`} style={appStyle}>
      <header className="topbar">
        <button className="brand" type="button" aria-label="闹之钟，返回首页总览" title="返回首页总览" onClick={() => setPage('home')}>
          <span className="brand-icon" aria-hidden="true"><AppIcon name="clock" /></span><span>闹之钟</span>
        </button>
        <nav aria-label="应用导航">
          {navigationPages.map(item => (
            <button key={item.id} type="button" className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)} aria-label={item.title} title={item.title}
              aria-current={page === item.id ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true"><AppIcon name={item.icon} /></span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="wallpaper-button" type="button" aria-label="设置壁纸" title="设置壁纸" onClick={() => { setWallpaperMessage(''); setWallpaperOpen(true) }}>
            <AppIcon name="wallpaper" />
          </button>
          <button className="top-balance" type="button" aria-label={`余额 ${coins}￥`} title="余额" onClick={() => setPage('coins')}>
            <span className="coin-icon" aria-hidden="true"><AppIcon name="coins" /></span><span>{coins}￥</span>
          </button>
        </div>
      </header>
      <main className="content" id="main-content">
        {page !== 'home' && <div className="page-return-bar">
          <button type="button" className="page-return" onClick={() => setPage('home')}>
            <AppIcon name="clock" /><span>返回总览</span>
          </button>
        </div>}
        {page === 'home' ? <HomePage memo={memo} onMemo={updateMemo} onSave={() => void persistMemo()} navigate={setPage}
            planArt={planArt} onPickPlanArt={() => { setPlanArtMessage(''); setPlanArtOpen(true) }} />
          : page === 'memo' ? <MemoPage />
          : page === 'settings' ? <SettingsPage health={health} theme={theme} unlocked={unlocked} onTheme={next => void changeTheme(next)}
            font={font} unlockedFonts={unlockedFonts} onFont={next => void changeFont(next)} />
          : page === 'tasks' ? <TasksPage /> : page === 'coins' ? <CoinsPage current={theme} onTheme={setTheme}
            currentFont={font} unlockedFonts={unlockedFonts} onFont={setFont} />
          : page === 'food' ? <FoodPage /> : page === 'fun' ? <FunPage /> : page === 'badminton' ? <BadmintonPage /> : null}
        {message && <p role="status" className="feedback">{message}</p>}
      </main>
      <WallpaperDialog open={wallpaperOpen} wallpaper={wallpaper} opacity={wallpaperOpacity}
        message={wallpaperMessage} onClose={() => setWallpaperOpen(false)}
        onImport={file => void importWallpaper(file)}
        onOpacityChange={value => void updateWallpaperOpacity(value)}
        onClear={() => void clearWallpaper()} />
      <PlanArtDialog open={planArtOpen} current={planArt} message={planArtMessage}
        onClose={() => setPlanArtOpen(false)}
        onSelect={src => void choosePlanArt(src)}
        onImport={file => void importPlanArt(file)}
        onReset={() => void resetPlanArt()} />
    </div>
  )
}

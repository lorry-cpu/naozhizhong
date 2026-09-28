import { useEffect, useState } from 'react'
import { all, saveSetting, setting, watchChanges } from '../db/database'
import { exportBackup, importBackup, parseBackup, type Backup } from '../db/backup'
import type { Badminton, Entertainment, Meal, TaskInstance, TimerRecord } from '../db/types'
import { badmintonMinutes } from '../domain/life'
import { FONTS, THEMES, type FontId, type ThemeId } from '../domain/rules'
import { elapsedMs } from '../domain/tasks'

export function SettingsPage({ health, theme, unlocked, onTheme, font, unlockedFonts, onFont }: {
  health: string; theme: ThemeId; unlocked: ThemeId[]; onTheme: (id: ThemeId) => void
  font: FontId; unlockedFonts: FontId[]; onFont: (id: FontId) => void
}) {
  const [tasks, setTasks] = useState<TaskInstance[]>([])
  const [timers, setTimers] = useState<TimerRecord[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [fun, setFun] = useState<Entertainment[]>([])
  const [games, setGames] = useState<Badminton[]>([])
  const [lastExport, setLastExport] = useState<string | number | boolean>()
  const [pending, setPending] = useState<Backup | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const load = () => void Promise.all([
      all('occurrences'), all('timers'), all('meals'), all('entertainment'), all('badminton'), setting('lastExport'),
    ]).then(([t, tm, m, f, b, last]) => {
      setTasks(t); setTimers(tm); setMeals(m); setFun(f); setGames(b); setLastExport(last)
    }).catch(e => setMessage(String(e)))
    load()
    return watchChanges(load)
  }, [])
  async function download() {
    try {
      const backup = await exportBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `自己的节奏-备份-${backup.exportedAt.slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      await saveSetting('lastExport', backup.exportedAt)
      setMessage('备份文件已导出，请妥善保管')
    } catch (e) { setMessage(`导出失败：${String(e)}`) }
  }
  async function inspect(file?: File) {
    setPending(null)
    if (!file) return
    try {
      const backup = parseBackup(JSON.parse(await file.text()))
      setPending(backup)
      setMessage('备份检查通过，请确认替换范围')
    } catch (e) { setMessage(`备份无效，原数据未改变：${e instanceof Error ? e.message : String(e)}`) }
  }
  async function restore() {
    if (!pending) return
    if (!window.confirm('恢复会替换当前全部任务、金币、风格、备忘及生活记录。建议先导出当前数据。确定继续？')) return
    try {
      await importBackup(pending)
      setPending(null)
      setMessage('恢复成功，所有数据已替换')
    } catch (e) { setMessage(`恢复失败，原数据未改变：${String(e)}`) }
  }
  return <>
    <h1>数据与设置</h1><p className="subtitle">数据保存在这台电脑的当前浏览器；定期导出文件便于恢复。</p>
    <section className="panel"><h2>本机数据</h2><p data-testid="storage-status">{health}</p>
      <label htmlFor="theme-choice">界面风格</label>
      <select id="theme-choice" value={theme} onChange={e => onTheme(e.target.value as ThemeId)}>
        {THEMES.map(item => <option key={item.id} value={item.id} disabled={!unlocked.includes(item.id)}>
          {item.name}{unlocked.includes(item.id) ? '' : '（未兑换）'}</option>)}
      </select>
      <label htmlFor="font-choice">界面字体</label>
      <select id="font-choice" value={font} onChange={e => onFont(e.target.value as FontId)}>
        {FONTS.map(item => <option key={item.id} value={item.id} disabled={!unlockedFonts.includes(item.id)}>
          {item.name}{unlockedFonts.includes(item.id) ? '' : '（请到金币与风格购买）'}</option>)}
      </select>
      <p className="muted-small">字体可以在“金币与风格”页面预览；思源宋体免费，其余字体每种 200 金币。</p>
    </section>
    <section className="panel"><h2>全部记录汇总</h2>
      <p>计划：{tasks.length} 条，已结算 {tasks.filter(t => t.status === 'settled').length} 条，累计计时 {Math.floor(timers.reduce((sum, t) => sum + elapsedMs(t), 0) / 60000)} 分钟</p>
      <p>饮食：{meals.length} 餐，已记录花费 ¥{meals.reduce((sum, r) => sum + (r.spent ?? 0), 0).toFixed(2)}</p>
      <p>娱乐：{fun.length} 项，实际已记录 {fun.reduce((sum, r) => sum + (r.actualMinutes ?? 0), 0)} 分钟</p>
      <p>羽毛球：{games.length} 次，{games.reduce((sum, r) => sum + badmintonMinutes(r), 0)} 分钟，消耗 {games.reduce((sum, r) => sum + r.balls, 0)} 个球</p>
    </section>
    <section className="panel"><h2>备份与恢复</h2>
      <p>上次导出：{typeof lastExport === 'string' ? new Date(lastExport).toLocaleString() : '从未导出'}</p>
      <button type="button" className="button-primary" onClick={() => void download()}>导出完整备份</button>
      <label htmlFor="backup-file">选择本机 JSON 备份文件</label>
      <input id="backup-file" type="file" accept=".json,application/json" onChange={e => void inspect(e.target.files?.[0])} />
      {pending && <div className="restore-preview"><p>将替换当前全部数据：{pending.data.templates.length} 个任务模板、{pending.data.occurrences.length} 个每日任务、
        {pending.data.ledger.length} 条金币流水、{pending.data.meals.length} 餐、{pending.data.entertainment.length} 项娱乐、
        {pending.data.badminton.length} 次打球、备忘与设置。导出时间：{pending.exportedAt}</p>
        <button className="button-primary" onClick={() => void restore()}>确认替换并恢复</button></div>}
      <p className="muted-small">如果清除了浏览器中此地址的站点数据，需用备份文件恢复。</p>
    </section>
    {message && <p role="status" className="feedback">{message}</p>}
  </>
}

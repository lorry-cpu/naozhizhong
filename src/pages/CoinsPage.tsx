import { useEffect, useState } from 'react'
import { all, byId, saveSetting, watchChanges } from '../db/database'
import type { CoinEntry } from '../db/types'
import { balance, redeem } from '../domain/coins'
import { THEMES, type ThemeId } from '../domain/rules'

export function CoinsPage({ current, onTheme }: { current: ThemeId; onTheme: (value: ThemeId) => void }) {
  const [total, setTotal] = useState(0)
  const [entries, setEntries] = useState<CoinEntry[]>([])
  const [unlocked, setUnlocked] = useState<ThemeId[]>(['warm'])
  const [error, setError] = useState('')
  async function load() {
    try {
      const [coins, history, cool, focus] = await Promise.all([
        balance(), all('ledger'), byId('settings', 'unlocked:cool'), byId('settings', 'unlocked:focus'),
      ])
      setTotal(coins)
      setEntries(history.sort((a, b) => b.at - a.at))
      setUnlocked(['warm', ...(cool?.value === true ? ['cool' as const] : []), ...(focus?.value === true ? ['focus' as const] : [])])
    } catch (reason) { setError(String(reason)) }
  }
  useEffect(() => { void load(); return watchChanges(() => void load()) }, [])
  async function choose(id: ThemeId, price: number) {
    try {
      setError('')
      if (unlocked.includes(id)) await saveSetting('theme', id)
      else {
        if (!window.confirm(`花费 ${price} 金币兑换并使用该风格？`)) return
        await redeem(id)
      }
      onTheme(id)
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  return <>
    <h1>金币与风格</h1>
    <p className="subtitle">金币来自计划打卡。余额可以为负数；兑换需要足额金币。</p>
    <section className="panel"><h2>当前余额：{total} 金币</h2>
      <div className="card-grid">{THEMES.map(item => <div className="summary-card" key={item.id}>
        <strong>{item.name}</strong><p>{item.price === 0 ? '免费' : `${item.price} 金币`}</p>
        <button type="button" className="button-primary" disabled={current === item.id}
          onClick={() => void choose(item.id, item.price)}>{current === item.id ? '使用中' : unlocked.includes(item.id) ? '切换使用' : '兑换风格'}</button>
      </div>)}</div>
    </section>
    <section className="panel"><h2>金币明细</h2>{entries.length === 0 ? <p className="subtitle">还没有金币记录。</p> :
      entries.map(entry => <div className="history-row" key={entry.id}><span>{new Date(entry.at).toLocaleString()} · {entry.reason}</span><strong>{entry.amount > 0 ? '+' : ''}{entry.amount}</strong></div>)}</section>
    {error && <p role="alert" className="error">{error}</p>}
  </>
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { all, saveSetting, watchChanges } from '../db/database'
import type { Setting } from '../db/types'
import { localDateKey } from '../domain/rules'

const keyFor = (date: string) => `memo:${date}`
const today = () => localDateKey(new Date())

export function MemoPage() {
  const [date, setDate] = useState(today())
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Setting[]>([])
  const [message, setMessage] = useState('')
  const editedDate = useRef<string | null>(null)
  const load = () => void all('settings').then(setRows).catch(error => setMessage(`读取备忘失败：${String(error)}`))
  useEffect(() => {
    load()
    return watchChanges(load)
  }, [])
  const records = useMemo(() => rows
    .filter(row => row.key.startsWith('memo:') && typeof row.value === 'string' && row.value.trim())
    .map(row => ({ date: row.key.slice(5), text: String(row.value) }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => b.date.localeCompare(a.date)), [rows])
  useEffect(() => {
    if (editedDate.current === date) return
    const saved = rows.find(row => row.key === keyFor(date))?.value
    const legacy = date === today() ? rows.find(row => row.key === 'memo')?.value : undefined
    setText(typeof saved === 'string' ? saved : typeof legacy === 'string' ? legacy : '')
  }, [date, rows])
  async function save() {
    try {
      await saveSetting(keyFor(date), text)
      if (date === today()) await saveSetting('memo', text)
      setMessage('备忘已保存到本机')
    } catch (error) { setMessage(`备忘保存失败：${String(error)}`) }
  }
  return <>
    <h1>备忘录</h1><p className="subtitle">按日期记录和查看每天的备忘信息。</p>
    <div className="toolbar"><label>查看日期 <input aria-label="备忘日期" type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div>
    <section className="panel"><h2>{date} 的备忘</h2>
      <textarea id="memo-editor" value={text} onChange={event => { editedDate.current = date; setText(event.target.value) }} placeholder="记录今天想到的事情…" />
      <button className="button-primary" onClick={() => void save()}>保存备忘</button>
    </section>
    <section className="panel memo-records-panel"><h2>每天记录</h2>
      <div className="memo-records-scroll">
        {records.length === 0 && <p className="subtitle">还没有按日期保存的备忘。</p>}
        {records.map(record => <button className={`memo-record ${record.date === date ? 'active' : ''}`} key={record.date} type="button" onClick={() => setDate(record.date)}>
          <strong>{record.date}</strong><span>{record.text}</span>
        </button>)}
      </div>
    </section>
    {message && <p role="status" className="feedback">{message}</p>}
  </>
}

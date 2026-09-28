// What is the browser ACTUALLY running? Compare loaded assets vs dist on disk.
const CDP = 'http://127.0.0.1:9333'
const list = await (await fetch(`${CDP}/json/list`)).json()
const page = list.find(t => t.type === 'page')
console.log('page url:', page.url)
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0; const pending = new Map()
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, x => x.error ? reject(new Error(JSON.stringify(x.error))) : resolve(x.result)); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
await send('Runtime.enable')
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
  return r.result.value
}

const out = await evaluate(`(() => {
  const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src)
  const links = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href)
  const p = document.querySelector('.tasks-page')
  const cs = p ? getComputedStyle(p) : null
  // find a stylesheet rule for .tasks-calendar-surface to see if the new CSS is loaded
  let ruleText = null
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules) {
        if (r.selectorText && r.selectorText.includes('.tasks-calendar-surface') && r.style && r.style.backdropFilter) {
          ruleText = r.cssText.slice(0, 400); break
        }
      }
    } catch (e) { ruleText = 'CORS: ' + e.message }
    if (ruleText) break
  }
  return {
    scripts, links,
    tasksPageExists: !!p,
    gVar: cs && cs.getPropertyValue('--g').trim(),
    fillVar: cs && cs.getPropertyValue('--task-calendar-opacity').trim(),
    backdropRule: ruleText,
    inlineStyle: p ? p.getAttribute('style') : null,
  }
})()`)
console.log(JSON.stringify(out, null, 2))
ws.close(); process.exit(0)

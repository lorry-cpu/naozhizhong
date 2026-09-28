// Pixel-level verification of the frosted-glass calendar.
// Drives headless Chrome over CDP, forces a known wallpaper, and measures the
// rendered pixels to prove: (1) backdrop-filter is applied, (2) the wallpaper is
// really being sampled/blurred, (3) the opacity slider is independent, (4) the
// glass-strength slider monotonically increases the glass look.
import fs from 'node:fs'
import zlib from 'node:zlib'

// Minimal PNG decoder (RGBA/RGB, 8-bit) using Node's built-in zlib, so the
// verification needs no extra dependency.
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, colorType = 6, bitDepth = 8
  const chunks = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
    } else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error('only 8-bit PNG supported')
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : (() => { throw new Error('unsupported colorType ' + colorType) })()
  const raw = zlib.inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 4)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      line[x] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * channels]
      out[(y * width + x) * 4 + 1] = line[x * channels + 1]
      out[(y * width + x) * 4 + 2] = line[x * channels + 2]
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255
    }
    prev = line
  }
  return { width, height, data: out }
}

const CDP = 'http://127.0.0.1:9333'
const URL_ = process.argv[2] || 'http://127.0.0.1:4173/'
const OUT = 'verify-out'
fs.mkdirSync(OUT, { recursive: true })

const list = await (await fetch(`${CDP}/json/list`)).json()
const page = list.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0
const pending = new Map()
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, x => x.error ? reject(new Error(JSON.stringify(x.error))) : resolve(x.result)); ws.send(JSON.stringify({ id: i, method: m, params: p })) })

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false })
// cache-buster so a rebuilt bundle is never served from cache
await send('Page.navigate', { url: URL_ + (URL_.includes('?') ? '&' : '?') + 'cb=' + Date.now() })
await new Promise(r => setTimeout(r, 3500))

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
  return r.result.value
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const mouse = async (type, x, y, extra = {}) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0, ...extra })
const clickAt = async (x, y) => {
  await mouse('mouseMoved', x, y, { buttons: 0 })
  await mouse('mousePressed', x, y)
  await mouse('mouseReleased', x, y)
}
const grab = async (clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })
  return decodePNG(Buffer.from(r.data, 'base64'))
}
const save = (png, name) => fs.writeFileSync(`${OUT}/${name}`, encodePNG(png))

// Minimal PNG encoder so screenshots can be written out for eyeballing.
function encodePNG({ width, height, data }) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const crcTable = (() => { const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) { let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c } return t })()
  const crc = (b) => { let c = -1
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0 }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length)
    const td = Buffer.from(type, 'ascii')
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([td, body])))
    return Buffer.concat([len, td, body, cr])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

const px = (png, x, y) => { const i = (png.width * y + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]] }
const meanRGB = (png) => { let r = 0, g = 0, b = 0; const n = png.width * png.height
  for (let i = 0; i < png.data.length; i += 4) { r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2] }
  return [r / n, g / n, b / n] }
const lum = (p) => p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722
// mean absolute horizontal gradient -> high for a crisp stripe pattern, low when blurred
const hfEnergy = (png) => { let s = 0, n = 0
  for (let y = 0; y < png.height; y++) for (let x = 1; x < png.width; x++) {
    s += Math.abs(lum(px(png, x, y)) - lum(px(png, x - 1, y))); n++ }
  return s / n }

const results = []
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`) }

// ---------- set up: hard-edged striped wallpaper so blur is unmistakable ----------
await evaluate(`(() => {
  const b = [...document.querySelectorAll('.nav-item')].find(x => (x.getAttribute('title')||'') === '今日计划')
  if (b) b.click(); return !!b
})()`)
await sleep(900)

const installWallpaper = () => evaluate(`(() => {
  const s = document.querySelector('.app-shell')
  s.style.setProperty('--app-wallpaper', 'repeating-linear-gradient(90deg,#ff0000 0 40px,#00ff00 40px 80px)')
  s.style.setProperty('--app-wallpaper-opacity','1')
  return true
})()`)
await installWallpaper()
await sleep(200)

const setSliders = async ({ width = null, blur = null, opacity = null }) => {
  // Open the settings dialog via a real click (React-friendly).
  const open = await evaluate(`(() => {
    const b = document.querySelector('.tasks-settings-button')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (open) { await clickAt(open.x, open.y); await sleep(400) }

  // Drag each range input with real mouse input so React's onChange fires.
  for (const [label, value] of [['宽度', width], ['毛玻璃', blur], ['透明度', opacity]]) {
    if (value === null) continue
    const box = await evaluate(`(() => {
      const el = [...document.querySelectorAll('.task-settings-dialog input[type=range]')]
        .find(i => i.getAttribute('aria-label') === ${JSON.stringify(label)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), min: +el.min, max: +el.max }
    })()`)
    if (!box) throw new Error('missing slider ' + label)
    const fx = box.x + 2 + (box.w - 4) * ((value - box.min) / (box.max - box.min))
    const fy = box.y + box.h / 2
    await clickAt(Math.round(fx), fy)
    await sleep(120)
  }
  await sleep(350)

  const applied = await evaluate(`(() => {
    const el = [...document.querySelectorAll('.task-settings-dialog input[type=range]')]
    return Object.fromEntries(el.map(i => [i.getAttribute('aria-label'), i.value]))
  })()`)

  const done = await evaluate(`(() => {
    const b = document.querySelector('.task-settings-dialog .dialog-actions .button-primary')
    if (!b) return false
    b.click()
    return true
  })()`)
  if (done) await sleep(450)

  await installWallpaper()
  await sleep(200)
  return applied
}

const probe = () => evaluate(`(() => {
  const p = document.querySelector('.tasks-page'), t = document.querySelector('.tasks-calendar-toolbar'), s = document.querySelector('.tasks-calendar-surface')
  const cs = getComputedStyle(p), ss = getComputedStyle(s)
  const tr = t.getBoundingClientRect()
  const r = s.getBoundingClientRect()
  return {
    g: cs.getPropertyValue('--g').trim(),
    fill: cs.getPropertyValue('--glass-fill').trim(),
    sat: cs.getPropertyValue('--glass-sat').trim(),
    backdrop: ss.backdropFilter || ss.webkitBackdropFilter,
    bg: ss.backgroundColor,
    toolbarRect: { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) },
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  }
})()`)

// ---------- TEST 1: backdrop-filter is actually valid/applied ----------
let applied = await setSliders({ width: 1300, blur: 48, opacity: 45 })
check('sliders actually respond to input (harness sanity)',
  applied['宽度'] === '1300' && applied['毛玻璃'] === '48' && applied['透明度'] === '45',
  `dialog inputs reported ${JSON.stringify(applied)}`)
let info = await probe()
check('backdrop-filter is applied (not "none")',
  !!info.backdrop && info.backdrop !== 'none' && /blur\(\s*[1-9]/.test(info.backdrop),
  `computed backdrop-filter = "${info.backdrop}"`)

// ---------- TEST 2: --g numeric + fill independent of blur ----------
check('--g resolves to a unitless number',
  /^0?\.\d+$|^1$/.test(info.g),
  `--g = "${info.g}" (must be a bare number, not a length)`)
check('opacity slider controls fill (blur no longer cancels it)',
  Math.abs(parseFloat(info.fill) - 0.45) < 0.001,
  `--glass-fill = ${info.fill} for 透明度 45% (expect 0.45)`)

// ---------- TEST 3: the wallpaper is genuinely being blurred by the glass ----------
const rect = info.rect
const toolbar = info.toolbarRect
const clip = {
  x: Math.round(toolbar.x + toolbar.w / 2 - Math.min(180, toolbar.w / 4)),
  y: toolbar.y + 18,
  width: Math.min(360, Math.max(120, toolbar.w / 2)),
  height: Math.min(38, toolbar.h - 30),
}

const glassPng = await grab(clip)
save(glassPng, 'glass-blur48-op45.png')
// reference: same region with backdrop-filter disabled
await evaluate(`(() => {
  const surface = document.querySelector('.tasks-calendar-surface')
  const toolbar = document.querySelector('.tasks-calendar-toolbar')
  for (const element of [surface, toolbar]) {
    element.style.backdropFilter = 'none'
    element.style.webkitBackdropFilter = 'none'
  }
})()`)
await sleep(250)
const noFilterPng = await grab(clip)
save(noFilterPng, 'glass-no-filter.png')
await evaluate(`(() => {
  const surface = document.querySelector('.tasks-calendar-surface')
  const toolbar = document.querySelector('.tasks-calendar-toolbar')
  for (const element of [surface, toolbar]) {
    element.style.backdropFilter = ''
    element.style.webkitBackdropFilter = ''
  }
})()`)
await sleep(250)

const glassHf = hfEnergy(glassPng), sharpHf = hfEnergy(noFilterPng)
const mG = meanRGB(glassPng), mN = meanRGB(noFilterPng)
const diffs = Math.abs(mG[0] - mN[0]) + Math.abs(mG[1] - mN[1]) + Math.abs(mG[2] - mN[2])

check('wallpaper is sampled & visibly blurred by the glass',
  glassHf < sharpHf * 0.5 && diffs > 8,
  `striping detail: glass ${glassHf.toFixed(1)} vs unfiltered ${sharpHf.toFixed(1)} (must be much lower); mean colour shift ${diffs.toFixed(1)}`)

// the glass area must still carry the wallpaper's hue, i.e. it is not just an opaque panel
const saturated = (() => { const p = px(glassPng, Math.floor(clip.width / 2), Math.floor(clip.height / 2))
  const mx = Math.max(...p), mn = Math.min(...p); return mx > 0 ? (mx - mn) / mx : 0 })()
check('glass is translucent (wallpaper colour shows through)', saturated > 0.15,
  `centre pixel saturation = ${saturated.toFixed(3)} (opaque dark panel would be ~0)`)

// ---------- TEST 4: opacity slider is monotonic and independent of blur ----------
const lums = []
for (const op of [20, 45, 70, 100]) {
  await setSliders({ blur: 48, opacity: op })
  const p = await grab(clip)
  save(p, `opacity-${op}.png`)
  const m = meanRGB(p)
  lums.push((m[0] + m[1] + m[2]) / 3)
}
const opIncreasing = lums.every((v, i) => i === 0 || v >= lums[i - 1] - 0.5)
const opDecreasing = lums.every((v, i) => i === 0 || v <= lums[i - 1] + 0.5)
check('透明度 slider changes the panel monotonically',
  (opIncreasing || opDecreasing) && Math.abs(lums[3] - lums[0]) > 3,
  `mean luminance at 20/45/70/100% = ${lums.map(v => v.toFixed(1)).join(' / ')}`)

// ---------- TEST 5: blur slider monotonically increases blur ----------
const hfs = []
for (const bl of [0, 12, 24, 48]) {
  await setSliders({ blur: bl, opacity: 45 })
  const p = await grab(clip)
  save(p, `blur-${bl}.png`)
  hfs.push(hfEnergy(p))
}
const blurMono = hfs.every((v, i) => i === 0 || v <= hfs[i - 1] + 0.6)
check('毛玻璃 slider monotonically increases blur',
  blurMono && hfs[0] > hfs[3],
  `striping detail at blur 0/12/24/48 = ${hfs.map(v => v.toFixed(1)).join(' / ')} (should fall)`)

// ---------- TEST 6: blur 0 is a clean, working state ----------
await setSliders({ blur: 0, opacity: 100 })
const flat = await probe()
const flatPng = await grab(clip)
save(flatPng, 'blur0-op100.png')
check('blur 0 / opacity 100 degrades gracefully (no blur, opaque)',
  /blur\(\s*0(px)?\)/.test(flat.backdrop || '') && Math.abs(parseFloat(flat.fill) - 1) < 0.001,
  `backdrop="${flat.backdrop}", --glass-fill=${flat.fill} (blur is off and fill is opaque)`)

// ---------- full-page screenshot at the new width ----------
await setSliders({ width: 1300, blur: 48, opacity: 45 })
const full = await grab({ x: 0, y: 0, width: 1500, height: 1000 })
save(full, 'full-1300-glass48.png')
const wide = await probe()
const logicalWidth = await evaluate(`(() => {
  const page = document.querySelector('.tasks-page')
  return parseFloat(getComputedStyle(page).width)
})()`)
check('calendar reaches the 1300px ceiling',
  logicalWidth >= 1300,
  `logical calendar width = ${logicalWidth}px; visual width after app zoom = ${wide.rect.w}px`)

console.log('\n================ SUMMARY ================')
const failed = results.filter(r => !r.pass)
console.log(`${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) { console.log('FAILURES:'); failed.forEach(f => console.log(' - ' + f.name)); }
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2))
ws.close()
process.exit(failed.length ? 1 : 0)

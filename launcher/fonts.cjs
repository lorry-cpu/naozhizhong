// 字体包的本机缓存：由启动器（Node）负责下载，浏览器再从本机读取。
//
// 为什么不直接在浏览器里 fetch GitHub Releases：
//   github.com 的下载地址**不返回 CORS 头**，浏览器跨域 fetch 会被直接拦截
//   （实测报 "blocked by CORS policy: No 'Access-Control-Allow-Origin' header"）。
//   改为 Node 下载到本机后同源提供，既绕开 CORS，也能跨浏览器复用同一份缓存。
//
// 缓存位置：<repo>/dist/fonts/fonts.tar.gz
//   放在 dist 下，是为了复用 serve.cjs 已有的静态文件服务和安全检查，
//   浏览器只需请求 /fonts/fonts.tar.gz 即可（同源，无 CORS）。
//   该目录已被 .gitignore 忽略（dist/fonts/），不会进仓库。
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const http = require('node:http')

/** 完整包应有的字节数；用于断点续传与完整性校验。 */
const EXPECTED_SIZE = 18811700
/** 低于这个体积视为无效缓存（例如上一轮没下完）。 */
const MIN_BYTES = 18 * 1000 * 1000
/** 单次连接内多久没有收到任何数据就判定卡死，重试。 */
const STALL_TIMEOUT_MS = 60000
/** 最多尝试几次（含续传）。 */
const MAX_ATTEMPTS = 5

/** 已存在完整缓存则复用。 */
function hasCompleteArchive(dest) {
  try {
    return fs.statSync(dest).size === EXPECTED_SIZE
  } catch {
    return false
  }
}

/** 下载一个片段到 partPath（断点续传用）。 */
function downloadRange(url, partPath, alreadyBytes, log) {
  return new Promise(resolve => {
    const headers = { 'User-Agent': 'naozhizhong-launcher' }
    if (alreadyBytes > 0) headers.Range = `bytes=${alreadyBytes}-`

    let settled = false
    const finish = outcome => {
      if (settled) return
      settled = true
      resolve(outcome)
    }

    // 按 URL 的实际协议选择 http/https：GitHub 的 302 可能指向任一协议，
    // 写死 https 会在遇到 http 地址时抛 ERR_INVALID_PROTOCOL。
    let request
    try {
      const parsed = new URL(url)
      const transport = parsed.protocol === 'http:' ? http : https
      request = transport.get(parsed, { headers }, response => {
        handleResponse(response, url, partPath, alreadyBytes, log, finish, () => request)
      })
    } catch (error) {
      finish({ ok: false, reason: error.message })
      return
    }

    request.on('error', error => finish({ ok: false, reason: error.message }))
  })
}

function handleResponse(response, url, partPath, alreadyBytes, log, finish, getRequest) {
  // GitHub 会 302 到 objects.githubusercontent.com，需手动跟随。
  if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
    response.resume()
    const next = new URL(response.headers.location, url).toString()
    downloadRange(next, partPath, alreadyBytes, log).then(finish)
    return
  }
  // 服务器不支持续传时，从头再来。
  if (alreadyBytes > 0 && response.statusCode === 200) {
    response.resume()
    fs.rmSync(partPath, { force: true })
    downloadRange(url, partPath, 0, log).then(finish)
    return
  }
  if (response.statusCode !== 200 && response.statusCode !== 206) {
    response.resume()
    finish({ ok: false, reason: `HTTP ${response.statusCode}` })
    return
  }

  const total = Number(response.headers['content-length']) || EXPECTED_SIZE
  let received = 0
  let lastPercent = -1
  let lastDataAt = Date.now()

  const stallCheck = setInterval(() => {
    if (Date.now() - lastDataAt > STALL_TIMEOUT_MS) {
      clearInterval(stallCheck)
      getRequest()?.destroy(new Error('连接停滞'))
    }
  }, 5000)

  response.on('data', chunk => {
    received += chunk.length
    lastDataAt = Date.now()
    const percent = Math.floor(received / total * 100)
    if (percent >= lastPercent + 20) {
      lastPercent = percent
      log(`  下载中… ${percent}%`)
    }
  })

  const file = fs.createWriteStream(partPath, { flags: alreadyBytes > 0 ? 'a' : 'w' })
  response.pipe(file)

  // 连接被提前关闭（对端断开、代理掐断）时 'finish' 与 'error' 都不会触发，
  // 不处理就会永远挂住，让上层无法重试/续传。
  response.on('aborted', () => {
    clearInterval(stallCheck)
    file.destroy()
    finish({ ok: false, reason: '连接被中断' })
  })
  // 声明了 Content-Length 却没读够，同样按中断处理。
  // 必须等 file 落盘完成后再判断，否则 response 'end' 会早于 'finish' 触发。
  response.on('end', () => {
    file.end(() => {
      const expected = Number(response.headers['content-length']) || 0
      if (expected > 0 && received < expected) {
        clearInterval(stallCheck)
        finish({ ok: false, reason: `数据不完整（${received}/${expected} 字节）` })
      }
    })
  })

  file.on('finish', () => {
    clearInterval(stallCheck)
    finish({ ok: true })
  })
  file.on('error', error => {
    clearInterval(stallCheck)
    finish({ ok: false, reason: error.message })
  })
}

/**
 * 确保字体包可用。返回 'cached' | 'downloaded' | 'failed'。
 * 绝不抛异常：字体只是观感增强，失败时应用继续用系统字体运行。
 */
async function ensureFontArchive(dest, url, log = console.log) {
  if (hasCompleteArchive(dest)) {
    log(`字体包已就绪：${(fs.statSync(dest).size / 1048576).toFixed(1)} MiB`)
    return 'cached'
  }

  const partPath = dest + '.part'
  log('正在下载字体包（首次约 18 MB，之后无需再下载）…')

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const have = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0
    const result = await downloadRange(url, partPath, have, log)

    const size = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0
    if (size === EXPECTED_SIZE) {
      fs.renameSync(partPath, dest)
      log(`字体包下载完成：${(size / 1048576).toFixed(1)} MiB`)
      return 'downloaded'
    }

    if (!result.ok) {
      log(`  第 ${attempt} 次尝试中断（${result.reason}），已收到 ${(size / 1048576).toFixed(1)} MiB`)
    }
    // 没有进展就别再空转。
    if (size <= have && !result.ok) {
      fs.rmSync(partPath, { force: true })
    }
  }

  fs.rmSync(partPath, { force: true })
  log(`字体包下载失败，将使用系统字体（不影响其它功能）。` +
      `网络恢复后重新启动应用即可重试。`)
  return 'failed'
}

module.exports = { ensureFontArchive, MIN_BYTES, EXPECTED_SIZE }

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

const EXPECTED_SIZE = 18811700
const MIN_BYTES = 18 * 1000 * 1000

/** 下载字体包并写入 dest；已存在且大小合理时直接复用。 */
function ensureFontArchive(dest, url, log = console.log) {
  if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_BYTES) {
    log(`字体包已就绪：${(fs.statSync(dest).size / 1048576).toFixed(1)} MiB`)
    return Promise.resolve('cached')
  }

  return new Promise(resolve => {
    log('正在下载字体包（首次约 18 MB，之后无需再下载）…')
    const file = fs.createWriteStream(dest + '.part')
    let received = 0
    let lastReport = 0

    const cleanup = () => { file.destroy(); fs.rmSync(dest + '.part', { force: true }) }

    const request = https.get(url, { headers: { 'User-Agent': 'naozhizhong-launcher' } }, response => {
      // GitHub 会 302 到 objects.githubusercontent.com，需手动跟随。
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        fs.rmSync(dest + '.part', { force: true })
        ensureFontArchive(dest, response.headers.location, log).then(resolve)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        cleanup()
        log(`字体包下载失败（HTTP ${response.statusCode}），将使用系统字体，不影响其它功能。`)
        resolve('failed')
        return
      }

      response.on('data', chunk => {
        received += chunk.length
        const percent = Math.floor(received / (Number(response.headers['content-length']) || EXPECTED_SIZE) * 100)
        if (percent >= lastReport + 10) { lastReport = percent; log(`  下载中… ${percent}%`) }
      })
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        if (received < MIN_BYTES) {
          fs.rmSync(dest + '.part', { force: true })
          log(`字体包不完整（只收到 ${received} 字节），将使用系统字体。`)
          resolve('failed')
          return
        }
        fs.renameSync(dest + '.part', dest)
        log(`字体包下载完成：${(received / 1048576).toFixed(1)} MiB`)
        resolve('downloaded')
      })
    })

    request.on('error', error => {
      cleanup()
      // 下载失败不是致命错误：应用会用系统字体照常运行。
      log(`字体包下载失败（${error.message}），将使用系统字体，不影响其它功能。`)
      resolve('failed')
    })
    request.setTimeout(120000, () => { request.destroy(new Error('下载超时')) })
  })
}

module.exports = { ensureFontArchive, MIN_BYTES }

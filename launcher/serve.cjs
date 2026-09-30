const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { openBrowser } = require('./open-browser.cjs')

const host = '127.0.0.1'
const port = 8765
const publicDir = path.resolve(__dirname, '..', 'dist')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.gz': 'application/gzip', '.txt': 'text/plain; charset=utf-8' }
const bundledFontPaths = new Set(['/fonts/fonts.tar.gz', '/fonts/OFL.txt', '/fonts/NOTICE.txt'])

if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.error('未找到构建文件。请先执行 npm install 和 npm run build。')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  let pathname
  try { pathname = decodeURIComponent(new URL(req.url, `http://${host}:${port}`).pathname) }
  catch { res.writeHead(400).end(); return }
  const filePath = path.resolve(publicDir, '.' + pathname)
  if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
    res.writeHead(403).end()
    return
  }
  // A source ZIP carries one font archive in public/; builds copy it to dist/.
  const finalPath = pathname === '/' ? path.join(publicDir, 'index.html')
    : bundledFontPaths.has(pathname) && !fs.existsSync(filePath)
      ? path.join(__dirname, '..', 'public', 'fonts', path.basename(pathname))
      : filePath
  fs.stat(finalPath, (statError, stat) => {
    if (statError || !stat.isFile()) { res.writeHead(404).end('Not found'); return }
    res.setHeader('X-Naozhizhong-App', '1')
    res.setHeader('Content-Type', mime[path.extname(finalPath)] || 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Cache-Control', 'no-cache')
    if (req.method === 'HEAD') { res.writeHead(200).end(); return }
    fs.createReadStream(finalPath).pipe(res)
  })
})

server.on('error', error => {
  if (error.code !== 'EADDRINUSE') {
    console.error(error)
    process.exitCode = 1
    return
  }

  const url = `http://${host}:${port}/`
  http.get(url, response => {
    response.resume()
    if (response.statusCode === 200 && response.headers['x-naozhizhong-app'] === '1') {
      console.log(`闹之钟已在运行：${url}`)
      if (!process.argv.includes('--no-open')) openBrowser(url)
      return
    }
    console.error(`端口 ${port} 已被其他服务占用，无法启动闹之钟。`)
    process.exitCode = 1
  }).on('error', probeError => {
    console.error(`端口 ${port} 已被占用，且无法确认现有服务：${probeError.message}`)
    process.exitCode = 1
  })
})
server.listen(port, host, () => {
  const url = `http://${host}:${port}/`
  console.log(`闹之钟已启动：${url}`)
  console.log('请保持此窗口开启；关闭窗口会停止应用。若浏览器没有自动打开，请复制上面的地址到浏览器。')
  if (!process.argv.includes('--no-open')) {
    openBrowser(url)
  }
})

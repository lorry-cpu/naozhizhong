import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { openBrowser, browserCommand } = require('../launcher/open-browser.cjs')
const url = 'http://127.0.0.1:8765/'

test('服务监听后通过系统默认浏览器关联打开固定地址', () => {
  let call
  openBrowser(url, (...args) => { call = args }, () => {}, 'win32')
  assert.deepEqual(call.slice(0, 2), ['cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`]])
  assert.equal(call[2].windowsHide, true)
  assert.equal(call[2].windowsVerbatimArguments, true)
  assert.equal(typeof call[3], 'function')
})

// 三个平台的开浏览器命令各不相同：这里逐个断言，避免只能靠「在对应系统上手动试」来验证。
test('Windows 用 cmd start 打开浏览器', () => {
  const { command, args, options } = browserCommand(url, 'win32')
  assert.equal(command, 'cmd.exe')
  // start 的第一个参数是窗口标题，必须显式留空，否则带引号的 URL 会被当成标题。
  assert.deepEqual(args, ['/d', '/s', '/c', `start "" "${url}"`])
  assert.equal(options.windowsHide, true)
  assert.equal(options.windowsVerbatimArguments, true)
})

test('macOS 用 open 打开浏览器', () => {
  const { command, args } = browserCommand(url, 'darwin')
  assert.equal(command, 'open')
  assert.deepEqual(args, [url])
})

test('Linux 等其他平台用 xdg-open 打开浏览器', () => {
  const { command, args } = browserCommand(url, 'linux')
  assert.equal(command, 'xdg-open')
  assert.deepEqual(args, [url])
})

test('浏览器关联启动失败时给出可手动访问的地址', () => {
  const messages = []
  openBrowser(url, (command, args, options, callback) => callback(new Error('无法启动')), message => messages.push(message), 'darwin')
  assert.match(messages[0], /未能自动打开浏览器/)
  assert.ok(messages[0].includes(url))

  openBrowser(url, () => { throw new Error('无法创建进程') }, message => messages.push(message), 'darwin')
  assert.ok(messages[1].includes(url))
})

// .command 是 macOS/Linux 的启动入口：CRLF 会让 shebang 变成 "#!/bin/bash\r"，
// bash 直接报 bad interpreter。这条测试守住换行与 shebang，不依赖运行平台。
test('macOS/Linux 启动脚本使用 LF 换行且 shebang 正确', async () => {
  const bytes = await readFile(new URL('../launcher/启动应用.command', import.meta.url))
  assert.equal(bytes.includes(13), false, '.command 必须是 LF 换行（不能含 CR）')
  assert.notEqual(bytes[0], 0xEF, '.command 不应带 UTF-8 BOM')
  const text = bytes.toString('utf8')
  assert.match(text, /^#!\/bin\/bash\n/, 'shebang 必须是 #!/bin/bash 且以 LF 结尾')
  // 必须调用同一个启动器，并切换到仓库根目录（双击时 cwd 并不在项目里）。
  assert.match(text, /cd "\$\(dirname "\$0"\)\/\.\."/)
  assert.match(text, /node launcher\/serve\.cjs/)
  // set -e 下 `node ... ` 直接失败会让脚本当场退出，后面的错误提示永远执行不到；
  // 必须用 `|| status=$?` 把退出码接住，端口占用之类的提示才看得见。
  assert.match(text, /node launcher\/serve\.cjs \|\| status=\$\?/, 'serve.cjs 的退出码必须先接住再判断')
  // 缺少 Node.js 时给出可读提示，而不是一句 command not found。
  assert.match(text, /需要先安装 Node\.js/)
})

// 打包成 ZIP 分发时，解压工具可能把 .command 的换行改坏；这里守住源文件与
// 启动器共用的约定：serve.cjs 在三个平台都调用 openBrowser（不再只限 win32）。
test('启动器在三个平台都会尝试打开浏览器', async () => {
  const serve = await readFile(new URL('../launcher/serve.cjs', import.meta.url), 'utf8')
  assert.doesNotMatch(serve, /process\.platform === 'win32'\s*&&\s*openBrowser/, 'serve.cjs 不应把开浏览器限制在 Windows')
  assert.doesNotMatch(serve, /process\.platform !== 'win32'/, 'serve.cjs 不应在非 Windows 上跳过开浏览器')
  assert.equal((serve.match(/openBrowser\(url\)/g) || []).length, 2, '两个入口（新建服务／复用已有服务）都调用 openBrowser')
  // 提示语不能写死 Windows 的 npm.cmd，否则 mac/Linux 用户会照抄一条无效命令。
  assert.doesNotMatch(serve, /npm\.cmd/, '构建提示不应写死 npm.cmd')
})

// Git 里必须带可执行位（100755），否则下载 ZIP 后 macOS 双击会报「权限不足」。
test('macOS/Linux 启动脚本在 Git 中带可执行位', async () => {
  const { execFileSync } = await import('node:child_process')
  const listing = execFileSync('git', ['ls-files', '-s', '--', 'launcher/启动应用.command'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.match(listing, /^100755 /, `.command 应为可执行文件（实际「${listing.trim()}」）`)
})

// gitattributes 决定检出时的换行：.command 必须 LF、.cmd 必须 CRLF，两者不能混。
test('gitattributes 固定两类启动脚本的换行', async () => {
  const { execFileSync } = await import('node:child_process')
  const attr = name => execFileSync('git', ['check-attr', 'eol', '--', name], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  }).trim()
  assert.match(attr('launcher/启动应用.command'), /eol: lf$/, '.command 应固定为 LF')
  assert.match(attr('launcher/启动应用.cmd'), /eol: crlf$/, '.cmd 应固定为 CRLF')
})

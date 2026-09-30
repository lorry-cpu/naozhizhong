const { execFile } = require('node:child_process')

/**
 * 按平台给出「打开默认浏览器」的命令。
 *
 * - win32：`cmd /c start "" <url>`（start 的第一个参数是窗口标题，必须留空）
 * - darwin：`open <url>`
 * - 其他（Linux 等）：`xdg-open <url>`
 *
 * 拆成纯函数，便于在不切换操作系统的情况下逐个平台做单元测试。
 */
function browserCommand(url, platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `start "" "${url}"`],
      options: { windowsHide: true, windowsVerbatimArguments: true }
    }
  }
  if (platform === 'darwin') {
    return { command: 'open', args: [url], options: {} }
  }
  return { command: 'xdg-open', args: [url], options: {} }
}

function openBrowser(url, run = execFile, report = console.error, platform = process.platform) {
  const onComplete = error => {
    if (error) report(`未能自动打开浏览器。请在浏览器地址栏输入：${url}（${error.message}）`)
  }
  const { command, args, options } = browserCommand(url, platform)
  try {
    run(command, args, options, onComplete)
  } catch (error) {
    onComplete(error)
  }
}

module.exports = { openBrowser, browserCommand }

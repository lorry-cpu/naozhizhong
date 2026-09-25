const { execFile } = require('node:child_process')

function openBrowser(url, run = execFile, report = console.error) {
  const command = `start "" "${url}"`
  const onComplete = error => {
    if (error) report(`未能自动打开浏览器。请在浏览器地址栏输入：${url}（${error.message}）`)
  }
  try {
    run('cmd.exe', ['/d', '/s', '/c', command], {
      windowsHide: true,
      windowsVerbatimArguments: true
    }, onComplete)
  } catch (error) {
    onComplete(error)
  }
}

module.exports = { openBrowser }

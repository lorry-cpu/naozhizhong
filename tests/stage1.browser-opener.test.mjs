import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { openBrowser } = require('../launcher/open-browser.cjs')
const url = 'http://127.0.0.1:8765/'

test('服务监听后通过 Windows 默认浏览器关联打开固定地址', () => {
  let call
  openBrowser(url, (...args) => { call = args }, () => {})
  assert.deepEqual(call.slice(0, 2), ['cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`]])
  assert.equal(call[2].windowsHide, true)
  assert.equal(call[2].windowsVerbatimArguments, true)
  assert.equal(typeof call[3], 'function')
})

test('浏览器关联启动失败时给出可手动访问的地址', () => {
  const messages = []
  openBrowser(url, (command, args, options, callback) => callback(new Error('无法启动')), message => messages.push(message))
  assert.match(messages[0], /未能自动打开浏览器/)
  assert.ok(messages[0].includes(url))

  openBrowser(url, () => { throw new Error('无法创建进程') }, message => messages.push(message))
  assert.ok(messages[1].includes(url))
})

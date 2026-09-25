import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('双击入口经 Windows 命令解释器启动后能从固定地址读取首页', { skip: process.platform !== 'win32' }, async () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  const child = spawn('cmd.exe', ['/d', '/c', 'launcher\\启动应用.cmd'], {
    cwd,
    env: { ...process.env, NODE_OPTIONS: '--require ./tests/fixtures/launcher-probe.cjs' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString() })
  child.stderr.on('data', chunk => { output += chunk.toString() })
  const ended = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolve(code))
  })
  try {
    let response
    for (let attempt = 0; attempt < 35; attempt++) {
      try { response = await fetch('http://127.0.0.1:8765/'); break }
      catch { await new Promise(resolve => setTimeout(resolve, 50)) }
    }
    assert.ok(response, `批处理文件必须启动本地服务。输出：${output}`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /自己的节奏/)
    assert.equal(await ended, 0, `批处理文件应正常退出。输出：${output}`)
    assert.match(output, /127\.0\.0\.1:8765/)
  } finally {
    child.kill()
  }
})

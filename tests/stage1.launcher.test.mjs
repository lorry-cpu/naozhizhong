import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

test('七个页面都属于实际应用入口，且不加载运行时远程资源', async () => {
  const shell = await readFile(new URL('../src/app/App.tsx', import.meta.url), 'utf8')
  assert.equal((shell.match(/id: '(home|memo|tasks|food|fun|badminton|coins|settings)'/g) || []).length, 8)
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
  assert.match(html, /<html lang="zh-CN">/)
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//)
})

test('固定地址本地服务能读取构建结果，并拒绝其他方法和路径穿越', async () => {
  const child = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: new URL('..', import.meta.url) })
  try {
    const origin = 'http://127.0.0.1:8765'
    let response
    for (let attempt = 0; attempt < 30; attempt++) {
      try { response = await fetch(origin); break }
      catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    assert.ok(response, '本地服务必须在固定端口启动')
    assert.equal(response.status, 200)
    assert.match(await response.text(), /自己的节奏/)
    assert.equal((await fetch(origin, { method: 'POST' })).status, 405)
    assert.equal((await fetch(origin + '/missing-file')).status, 404)
    assert.notEqual((await fetch(origin + '/%2e%2e/%2e%2e/PRD.md')).status, 200)
  } finally {
    child.kill()
  }
})

test('双击启动时复用已经运行的闹之钟服务并打开浏览器', { skip: process.platform !== 'win32' }, async () => {
  const cwd = new URL('..', import.meta.url)
  const first = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd })
  let second
  let output = ''
  try {
    const origin = 'http://127.0.0.1:8765'
    let response
    for (let attempt = 0; attempt < 30; attempt++) {
      try { response = await fetch(origin); break }
      catch { await new Promise(resolve => setTimeout(resolve, 75)) }
    }
    assert.ok(response, '第一个实例应在固定端口启动')
    second = spawn('cmd.exe', ['/d', '/c', 'launcher\\启动应用.cmd'], {
      cwd,
      env: { ...process.env, NODE_OPTIONS: '--require ./tests/fixtures/launcher-browser-probe.cjs' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    second.stdin.end()
    second.stdout.on('data', chunk => { output += chunk.toString() })
    second.stderr.on('data', chunk => { output += chunk.toString() })
    const exitCode = await new Promise((resolve, reject) => {
      second.once('error', reject)
      second.once('exit', resolve)
    })
    assert.equal(exitCode, 0, output)
    assert.match(output, /闹之钟已在运行：http:\/\/127\.0\.0\.1:8765/)
    assert.match(output, /BROWSER_OPEN:http:\/\/127\.0\.0\.1:8765\//)
    assert.equal((await fetch(origin)).status, 200)
  } finally {
    if (first.exitCode === null) {
      first.kill()
      await new Promise(resolve => first.once('exit', resolve))
    }
    if (second?.exitCode === null) {
      second.kill()
      await new Promise(resolve => second.once('exit', resolve))
    }
  }
})

test('端口被其他网页占用时不误开浏览器', async () => {
  const occupied = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<html>unrelated</html>')
  })
  await new Promise(resolve => occupied.listen(8765, '127.0.0.1', resolve))
  let child
  try {
    child = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: new URL('..', import.meta.url) })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { output += chunk.toString() })
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    assert.equal(exitCode, 1, output)
    assert.match(output, /已被其他服务占用/)
  } finally {
    if (child?.exitCode === null) {
      child.kill()
      await new Promise(resolve => child.once('exit', resolve))
    }
    await new Promise(resolve => occupied.close(resolve))
  }
})

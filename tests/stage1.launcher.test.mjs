import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

test('七个页面都属于实际应用入口，且不加载运行时远程资源', async () => {
  const shell = await readFile(new URL('../src/app/App.tsx', import.meta.url), 'utf8')
  assert.equal((shell.match(/id: '(home|tasks|food|fun|badminton|coins|settings)'/g) || []).length, 7)
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

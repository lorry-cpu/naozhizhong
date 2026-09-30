import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

for (const ending of ['LF', 'CRLF']) {
  test('Windows launcher runs with ' + ending + ' from a Chinese path with spaces', { skip: process.platform !== 'win32' }, async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'naozhizhong-batch-'))
    const project = path.join(temporary, '闹之钟 ZIP 测试')
    const launcher = path.join(project, 'launcher')
    try {
      await mkdir(launcher, { recursive: true })
      const original = await readFile(path.join(root, 'launcher', '启动应用.cmd'), 'utf8')
      const normalized = original.replace(/\r\n/g, '\n')
      await writeFile(path.join(launcher, '启动应用.cmd'), ending === 'LF' ? normalized : normalized.replace(/\n/g, '\r\n'))
      // Isolate batch parsing from the live server, browser, and fixed port.
      await writeFile(path.join(launcher, 'serve.cjs'), 'console.log("BATCH_CWD:" + process.cwd())\n')
      const child = spawn('cmd.exe', ['/d', '/c', '启动应用.cmd'], {
        cwd: launcher,
        env: { ...process.env, NODE_OPTIONS: '' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout.on('data', bytes => { output += bytes.toString() })
      child.stderr.on('data', bytes => { output += bytes.toString() })
      let timer
      try {
        const code = await new Promise((resolve, reject) => {
          child.once('error', reject)
          child.once('close', resolve)
          timer = setTimeout(() => {
            try { execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }) } catch {}
            reject(new Error('Batch script did not exit: ' + output))
          }, 10000)
        })
        assert.equal(code, 0, output)
        assert.equal(output.trim(), 'BATCH_CWD:' + project)
      } finally {
        clearTimeout(timer)
      }
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })
}

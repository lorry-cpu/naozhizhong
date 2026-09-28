import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { datesThrough, appliesOn, makeInstance } from '../src/domain/tasks.ts'
import { payoutFor } from '../src/domain/rules.ts'
import { mondayOf, validateMeal, validateBadminton } from '../src/domain/life.ts'

test('跨年跨月及每周重复；金币阈值与生活数据边界', () => {
  assert.deepEqual(datesThrough('2026-12-30','2027-01-02'), ['2026-12-30','2026-12-31','2027-01-01','2027-01-02'])
  const weekly = { id: 'a', title: '每周', startDate: '2026-12-30', time: '08:00', minutes: 31, difficulty: 'easy', repeat: 'weekly', endDate: null }
  assert.equal(appliesOn(weekly, '2027-01-06'), true)
  assert.equal(appliesOn(weekly, '2027-01-05'), false)
  assert.equal(makeInstance(weekly, '2027-01-06').id, 'a@2027-01-06')
  assert.equal(mondayOf('2027-01-03'), '2026-12-28')
  assert.deepEqual([0, 49, 50, 100].map(p => payoutFor(20,p)), [-20,-1,10,20])
  assert.throws(() => validateMeal({id:'a',date:'2026-12-30',kind:'午餐',time:'12:00',food:'米饭',spent:-1}))
  assert.throws(() => validateBadminton({id:'a',date:'2026-12-30',start:'18:00',end:'17:00',balls:1,training:'高远球',feeling:'好'}))
  // 子进程的 stdout 会被 Node 加上 ANSI 颜色码（数字默认黄色），
  // 这里显式关掉颜色再比对，避免把 "\x1B[33m23\x1B[39m" 当成结果。
  const dst = execFileSync(process.execPath, ['--input-type=module', '-e',
    "import { nextMidnight } from './src/domain/rules.ts'; console.log((nextMidnight('2026-03-08')-new Date(2026,2,8).getTime())/3600000)"],
    { env: { ...process.env, TZ: 'America/New_York', NO_COLOR: '1', FORCE_COLOR: '0' }, encoding: 'utf8' })
    .replace(/\u001B\[[0-9;]*m/g, '')
    .trim()
  assert.equal(dst, '23')
})

test('浏览器打开状态跨零点：部分打卡扣币、到期计时截断、每日任务生成新一天且不重复扣币', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage7-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch('http://127.0.0.1:8765')).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 80)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    const page = context.pages()[0] || await context.newPage()
    await page.clock.install({ time: new Date('2026-09-24T15:59:55.000Z') })
    await page.goto('http://127.0.0.1:8765')
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.locator('.tasks-view-switch').getByRole('button', { name: '日' }).click()
    const date = await page.getByLabel('查看日期').inputValue()
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('部分完成')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('部分完成', { exact: true }).waitFor()
    await page.getByRole('button', { name: '打卡' }).click()
    await page.getByRole('dialog').getByRole('slider').fill('49')
    await page.getByText('预计结算：-1 金币').waitFor()
    await page.getByRole('button', { name: '确认打卡' }).click()
    await page.getByText(/已结算 49%/).waitFor()
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('零点任务')
    await page.getByLabel('重复').selectOption('daily')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('零点任务', { exact: true }).waitFor()
    await page.getByRole('button', { name: '开始计时' }).click()
    await page.getByRole('button', { name: '暂停计时' }).waitFor()
    const timerStart = await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r=indexedDB.open('personal-rhythm-v1'); r.onsuccess=()=>resolve(r.result) })
      const data = await new Promise(resolve => { const r=db.transaction('timers').objectStore('timers').getAll(); r.onsuccess=()=>resolve(r.result) })
      return data[0].startedAt
    })
    await page.clock.runFor(6000)
    await page.getByText(/已结算 0%/).waitFor()
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    await page.getByText('当前余额：-7 金币').waitFor()
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    const next = await page.evaluate(date => {
      const [year, month, day] = date.split('-').map(Number)
      const at = new Date(year, month - 1, day + 1)
      return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    }, date)
    await page.getByLabel('查看日期').fill(next)
    await page.getByText('零点任务', { exact: true }).waitFor()
    await page.reload()
    await page.getByRole('navigation').getByRole('button', { name: '金币与风格' }).click()
    await page.getByText('当前余额：-7 金币').waitFor()
    assert.equal(await page.getByText(/到期未完成 · 零点任务/).count(), 1)
    const entry = await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r=indexedDB.open('personal-rhythm-v1'); r.onsuccess=()=>resolve(r.result) })
      const data = await new Promise(resolve => { const r=db.transaction('timers').objectStore('timers').getAll(); r.onsuccess=()=>resolve(r.result) })
      return data[0]
    })
    assert.equal(entry.startedAt, null)
    assert.equal(entry.accumulatedMs, Date.parse('2026-09-24T16:00:00.000Z') - timerStart)
    page.on('dialog', dialog => dialog.accept())
    await page.locator('.summary-card').filter({ hasText: '清爽冷调' }).getByRole('button', { name: '兑换风格' }).click()
    await page.getByRole('alert').getByText(/金币不足/).waitFor()
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

test('修改重复规则仅影响生效日之后，已生成的未来实例改按新规则出现', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-repeat-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch('http://127.0.0.1:8765')).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 80)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    const page = context.pages()[0] || await context.newPage()
    await page.goto('http://127.0.0.1:8765')
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.locator('.tasks-view-switch').getByRole('button', { name: '日' }).click()
    const dates = await page.evaluate(() => [0,1,2,8].map(offset => {
      const d = new Date(); d.setDate(d.getDate() + offset)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }))
    await page.getByRole('button', { name: '新建任务' }).click()
    await page.getByPlaceholder('例如：阅读专业资料').fill('改期重复')
    await page.getByLabel('重复').selectOption('daily')
    await page.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('改期重复', { exact: true }).waitFor()
    await page.getByLabel('查看日期').fill(dates[2])
    await page.getByText('改期重复', { exact: true }).waitFor()
    await page.getByLabel('查看日期').fill(dates[0])
    await page.getByRole('button', { name: '调整后续重复' }).click()
    await page.getByLabel('生效日期').fill(dates[1])
    await page.getByLabel('后续重复', { exact: true }).selectOption('weekly')
    await page.getByRole('button', { name: '保存后续规则' }).click()
    await page.getByRole('button', { name: '打卡' }).click()
    await page.getByRole('button', { name: '确认打卡' }).click()
    await page.getByText(/已结算 100%/).waitFor()
    await page.getByLabel('查看日期').fill(dates[1])
    await page.getByText('改期重复', { exact: true }).waitFor()
    await page.getByLabel('查看日期').fill(dates[2])
    await page.getByText('这一天还没有计划').waitFor()
    await page.getByLabel('查看日期').fill(dates[3])
    await page.getByText('改期重复', { exact: true }).waitFor()
    await page.getByLabel('查看日期').fill(dates[0])
    await page.getByText(/已结算 100%/).waitFor()
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

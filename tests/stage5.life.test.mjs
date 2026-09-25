import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

test('饮食、娱乐和羽毛球各自保存、编辑、校验、统计并在重开后保留', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage5-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'])
  let context
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch('http://127.0.0.1:8765')).ok) break } catch { await new Promise(resolve => setTimeout(resolve, 80)) }
    }
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    let page = context.pages()[0] || await context.newPage()
    await page.goto('http://127.0.0.1:8765')
    const nav = name => page.getByRole('navigation').getByRole('button', { name })
    await nav('饮食计划').click()
    await page.getByLabel('吃什么').fill('西红柿鸡蛋饭')
    await page.getByRole('button', { name: '保存餐次' }).click()
    await page.getByText(/西红柿鸡蛋饭 · 未记录花费/).waitFor()
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    await page.getByLabel('实际花费', { exact: true }).fill('12.50')
    await page.getByRole('button', { name: '保存餐次' }).click()
    await page.getByText(/西红柿鸡蛋饭 · ¥12.50/).waitFor()
    assert.match(await page.locator('#main-content').innerText(), /自 .* 起：¥12.50 · 1 餐/)
    await nav('游戏娱乐').click()
    await page.getByLabel('娱乐项目').fill('轻松玩一局')
    await page.getByRole('button', { name: '保存娱乐记录' }).click()
    await page.getByText(/轻松玩一局 .* 实际 未记录/).waitFor()
    await page.getByRole('button', { name: '编辑与记录实际' }).click()
    await page.getByLabel('实际时长').fill('45')
    await page.getByRole('button', { name: '保存娱乐记录' }).click()
    await page.getByText(/轻松玩一局 .* 实际 45 分钟/).waitFor()
    assert.match(await page.locator('#main-content').innerText(), /实际 45 分钟/)
    await nav('羽毛球').click()
    await page.getByLabel('消耗球数').fill('3')
    await page.getByLabel('训练内容').fill('后场高远球')
    await page.getByLabel('个人感受').fill('手感不错')
    await page.getByLabel('结束时间').fill('17:00')
    await page.getByRole('button', { name: '保存打球记录' }).click()
    assert.match(await page.getByRole('alert').textContent(), /结束时间须晚于开始时间/)
    await page.getByLabel('结束时间').fill('19:30')
    await page.getByRole('button', { name: '保存打球记录' }).click()
    await page.getByText(/1 次 · 90 分钟 · 消耗 3 个球/).waitFor()
    await context.close()
    context = await chromium.launchPersistentContext(profile, { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
    page = context.pages()[0] || await context.newPage()
    await page.goto('http://127.0.0.1:8765')
    await nav('饮食计划').click()
    await page.getByText(/西红柿鸡蛋饭 · ¥12.50/).waitFor()
    await nav('游戏娱乐').click()
    await page.getByText(/轻松玩一局 .* 实际 45 分钟/).waitFor()
    await nav('羽毛球').click()
    await page.getByText(/1 次 · 90 分钟 · 消耗 3 个球/).waitFor()
    assert.match(await page.locator('#main-content').innerText(), /后场高远球[\s\S]*手感不错/)
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: '删除' }).click()
    await page.getByText(/0 次 · 0 分钟 · 消耗 0 个球/).waitFor()
    assert.equal(await page.getByText('后场高远球').count(), 0)
  } finally {
    await context?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

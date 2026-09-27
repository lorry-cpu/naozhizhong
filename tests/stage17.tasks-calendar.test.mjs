import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

test('今日计划支持日周月视图；新增与界面设置按新字段工作并持久化', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage17-'))
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        if ((await fetch(origin)).ok) break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 80))
      }
    }
    browser = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true, acceptDownloads: true })
    const page = browser.pages()[0] || await browser.newPage()
    await page.goto(origin)
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()

    assert.equal(await page.locator('.tasks-calendar-surface').count(), 1)
    assert.equal(await page.locator('.tasks-view-switch button').count(), 3)
    assert.equal(await page.locator('.tasks-add-button').getAttribute('title'), '新增')
    assert.equal(await page.locator('.tasks-settings-button').getAttribute('title'), '界面设置')
    const selectedDate = await page.getByLabel('查看日期').inputValue()
    await page.getByLabel('查看日期').fill('2026-09-09')
    assert.equal(await page.locator('.tasks-month-cell[aria-label="2026-09-09"] .tasks-cell-date small').innerText(), '廿八')
    await page.getByLabel('查看日期').fill(selectedDate)

    await page.locator('.tasks-add-button').click()
    const createDialog = page.locator('.task-dialog')
    await createDialog.waitFor()
    assert.equal(await createDialog.getByText('分类', { exact: true }).count(), 0)
    assert.equal(await createDialog.getByLabel('内容').count(), 1)
    assert.equal(await createDialog.getByLabel('日期').count(), 1)
    assert.equal(await createDialog.getByLabel('开始时间').count(), 1)
    assert.equal(await createDialog.getByLabel('预计分钟').count(), 1)
    assert.equal(await createDialog.getByLabel('难度').count(), 1)
    assert.equal(await createDialog.getByLabel('重复').count(), 1)
    assert.equal(await createDialog.locator('.task-form-detail-grid-three').count(), 1)
    const difficultyBox = await createDialog.getByLabel('难度').boundingBox()
    const repeatBox = await createDialog.getByLabel('重复').boundingBox()
    assert.ok(difficultyBox && repeatBox && Math.abs(difficultyBox.y - repeatBox.y) < 2, '难度和重复应保持同一行对齐')
    const actionBoxes = await createDialog.locator('.dialog-actions button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect()
      return { left: rect.left, right: rect.right }
    }))
    assert.equal(actionBoxes.length, 2)
    assert.equal(await createDialog.locator('.dialog-actions').evaluate(element => getComputedStyle(element).gap), '12px')
    assert.ok(actionBoxes[1].left - actionBoxes[0].right >= 10, '取消和添加按钮之间应有明确间距')

    await createDialog.getByLabel('内容').fill('日历视图验证任务')
    await createDialog.getByLabel('开始时间').fill('10:30')
    await createDialog.getByLabel('预计分钟').fill('40')
    await createDialog.getByLabel('难度').selectOption('medium')
    await createDialog.getByRole('button', { name: '保存任务' }).click()
    await page.getByText('日历视图验证任务', { exact: true }).waitFor()

    for (const label of ['日', '周', '月']) {
      await page.locator('.tasks-view-switch').getByRole('button', { name: label, exact: true }).click()
      assert.equal(await page.locator('.tasks-view-switch button.active').innerText(), label)
    }

    await page.getByText('日历视图验证任务', { exact: true }).first().click()
    await page.locator('.tasks-day-row').waitFor()
    await page.getByRole('button', { name: /开始计时/ }).click()
    await page.waitForTimeout(80)
    await page.getByRole('button', { name: /暂停计时/ }).click()
    await page.getByRole('button', { name: '打卡', exact: true }).click()
    await page.getByRole('dialog').getByRole('slider').fill('75')
    await page.getByRole('button', { name: '确认打卡' }).click()
    await page.getByText(/已结算 75%/).waitFor()

    await page.locator('.tasks-settings-button').click()
    const settingsDialog = page.locator('.task-settings-dialog')
    await settingsDialog.waitFor()
    assert.equal(await settingsDialog.getByText('分类', { exact: true }).count(), 0)
    const width = settingsDialog.locator('input[type="range"]').first()
    await width.fill('900')
    const opacity = settingsDialog.getByRole('slider', { name: '透明度' })
    await opacity.fill('60')
    await settingsDialog.getByRole('button', { name: '暗色字' }).click()
    assert.equal(await page.locator('.tasks-page.tasks-text-dark').count(), 1)
    for (const [label, extension] of [['JSON', 'json'], ['CSV', 'csv'], ['日历 .ics', 'ics']]) {
      const downloadPromise = page.waitForEvent('download')
      await settingsDialog.getByRole('button', { name: label, exact: true }).click()
      const download = await downloadPromise
      assert.match(download.suggestedFilename(), new RegExp(`\\.${extension}$`))
      const contents = await readFile(await download.path(), 'utf8')
      assert.ok(contents.includes('日历视图验证任务'), `${extension} 包含本地计划`)
      if (extension === 'json') assert.equal(JSON.parse(contents).occurrences[0].percentage, 75)
      if (extension === 'csv') assert.match(contents, /"75"/)
      if (extension === 'ics') assert.match(contents, /BEGIN:VEVENT/)
    }
    await settingsDialog.getByRole('button', { name: '完成' }).click()
    await page.reload()
    await page.getByRole('navigation').getByRole('button', { name: '今日计划' }).click()
    await page.locator('.tasks-settings-button').click()
    assert.equal(await page.locator('.task-settings-dialog input[type="range"]').first().inputValue(), '900')
    assert.equal(await page.getByRole('slider', { name: '透明度' }).inputValue(), '60')
    assert.equal(await page.locator('.tasks-page.tasks-text-dark').count(), 1)
  } finally {
    await browser?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

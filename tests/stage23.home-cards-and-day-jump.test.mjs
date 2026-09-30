import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const dbName = 'personal-rhythm-v1'

const seed = async (page, databaseName) => page.evaluate(async name => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const today = new Date()
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const monday = new Date(today)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const dates = Array.from({ length: 21 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index - 7)
    return key(date)
  })
  const put = (store, rows) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    for (const row of rows) tx.objectStore(store).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  const uid = () => crypto.randomUUID()
  const many = (store, build) => put(store, dates.flatMap(date => Array.from({ length: 6 }, (_, index) => build(date, index, uid()))))
  await many('meals', (date, index, id) => ({ id, date, kind: '加餐', time: `0${index + 1}:00`.slice(-5), food: `食物名称第${index + 1}份`, spent: 12.5 }))
  await many('entertainment', (date, index, id) => ({ id, date, category: '游戏', title: `娱乐项目名称第${index + 1}个`, plannedTime: '19:00', plannedMinutes: 60, actualMinutes: 30 }))
  db.close()
}, databaseName)

test('首页卡片位置固定；月/周视图点日期跳日视图；今日计划排在备忘录之前', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage23-'))
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
    browser = await chromium.launchPersistentContext(profile, {
      executablePath: chrome, headless: true, viewport: { width: 1440, height: 1000 },
    })
    const page = browser.pages()[0] || await browser.newPage()
    await page.goto(origin)

    // ---- 问题 3：今日计划排在备忘录之前（导航第一个位置） ----
    const navOrder = await page.getByRole('navigation', { name: '应用导航' })
      .locator('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))
    assert.deepEqual(navOrder.slice(0, 2), ['今日计划', '备忘录'], `导航前两项为今日计划、备忘录（实际 ${navOrder.slice(0, 2).join('、')}）`)

    // ---- 问题 1：首页摘要卡片位置固定、行不被截断 ----
    await seed(page, dbName)
    await page.reload()
    await page.waitForFunction(() => document.querySelectorAll('.home-note-scroll').length === 2)

    const measureCards = () => page.evaluate(() => {
      const read = selector => {
        const card = document.querySelector(selector)
        const copy = card.querySelector('[class$="-copy"]')
        const title = copy.querySelector('.home-poster-title')
        const body = copy.querySelector('.home-note-scroll, .home-note-body')
        const link = copy.querySelector('.button-link')
        const box = element => {
          const rect = element.getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom, height: rect.height }
        }
        return {
          card: box(card),
          title: box(title),
          body: box(body),
          link: box(link),
          // 正文里的每一行都必须完整落在正文区内，也就是不能被切掉半行。
          linesFit: [...body.querySelectorAll('.home-line')].every(line => {
            const rect = line.getBoundingClientRect()
            return rect.bottom <= body.getBoundingClientRect().bottom + 0.5
          }),
          hiddenLines: [...body.querySelectorAll('.home-line')].filter(line => {
            const rect = line.getBoundingClientRect()
            return rect.bottom > body.getBoundingClientRect().bottom + 0.5
          }).map(line => line.textContent),
          more: body.querySelector('.home-more-line')?.textContent?.trim() || '',
        }
      }
      return { food: read('.home-note-food'), fun: read('.home-note-fun'), ball: read('.home-note-ball') }
    })

    const withMany = await measureCards()

    // 三张卡片等高（同一行）。
    for (const key of ['fun', 'ball']) {
      assert.ok(
        Math.abs(withMany[key].card.height - withMany.food.card.height) <= 1,
        `${key} 卡片与饮食卡片等高（${withMany[key].card.height.toFixed(1)} vs ${withMany.food.card.height.toFixed(1)}）`,
      )
    }
    for (const [label, card] of [['饮食', withMany.food], ['娱乐', withMany.fun]]) {
      // 标题在正文之上、底部入口在正文之下：三者顺序固定。
      assert.ok(card.title.bottom <= card.body.top + 1, `${label}卡片标题在正文之上`)
      assert.ok(card.link.top >= card.body.bottom - 1, `${label}卡片底部入口在正文之下`)
      // 底部入口完整落在卡片内部，没有被挤出或被圆角切掉。
      assert.ok(
        card.link.bottom <= card.card.bottom + 0.5,
        `${label}卡片底部入口在卡片内（入口底 ${card.link.bottom.toFixed(1)} vs 卡片底 ${card.card.bottom.toFixed(1)}）`,
      )
      // 没有半截行。
      assert.equal(card.linesFit, true, `${label}卡片正文每一行都完整显示（被截断：${card.hiddenLines.join(' / ')}）`)
      assert.match(card.more, /^还有 \d+ (餐|条)…$/, `${label}卡片显示省略提示（实际「${card.more}」）`)
    }

    // 清掉记录后：标题与底部入口的绝对位置不变（卡片固定尺寸）。
    await page.evaluate(async name => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise(resolve => {
        const tx = db.transaction(['meals', 'entertainment'], 'readwrite')
        tx.objectStore('meals').clear()
        tx.objectStore('entertainment').clear()
        tx.oncomplete = () => resolve()
      })
      db.close()
    }, dbName)
    await page.reload()
    await page.waitForFunction(() => document.querySelectorAll('.home-note-scroll').length === 2)
    const withFew = await measureCards()

    for (const [label, card] of [['饮食', 'food'], ['娱乐', 'fun'], ['运动', 'ball']]) {
      assert.ok(
        Math.abs(withFew[card].card.height - withMany[card].card.height) <= 1,
        `${label}卡片高度不随记录多少变化（${withFew[card].card.height.toFixed(1)} vs ${withMany[card].card.height.toFixed(1)}）`,
      )
      assert.ok(
        Math.abs(withFew[card].title.top - withMany[card].title.top) <= 1,
        `${label}卡片标题位置固定`,
      )
      assert.ok(
        Math.abs(withFew[card].link.top - withMany[card].link.top) <= 1,
        `${label}卡片底部入口位置固定（${withFew[card].link.top.toFixed(1)} vs ${withMany[card].link.top.toFixed(1)}）`,
      )
    }

    // ---- 问题 2：月／周视图点日期都跳到日视图 ----
    await seed(page, dbName)
    await page.reload()
    const openNav = async name => {
      await page.getByRole('navigation').getByRole('button', { name }).click()
      await page.waitForFunction(
        target => document.querySelector(`nav button[aria-label="${target}"]`)?.getAttribute('aria-current') === 'page',
        name,
      )
    }
    for (const name of ['今日计划', '备忘录', '饮食计划', '游戏娱乐', '羽毛球']) {
      await openNav(name)
      for (const [view, dayButton] of [
        ['月', '.tasks-month-cell .tasks-cell-date'],
        ['周', '.tasks-week-heading'],
      ]) {
        await page.locator('.tasks-view-switch').getByRole('button', { name: view, exact: true }).click()
        await page.locator(dayButton).first().waitFor()
        await page.locator(dayButton).first().click()
        const active = await page.locator('.tasks-view-switch button.active').innerText()
        assert.equal(active, '日', `${name} ${view}视图点日期后切到日视图（当前 ${active}）`)
        const isDayView = await page.locator('[aria-label="日视图"]').count()
        assert.equal(isDayView, 1, `${name} ${view}视图点日期后显示日视图内容`)
      }
    }
  } finally {
    await browser?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

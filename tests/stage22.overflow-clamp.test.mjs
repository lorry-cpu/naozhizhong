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

// 往各个表里塞入「内容偏多」的记录：周视图每列 7 条、首页当天 6 条。
const seed = async (page, name) => page.evaluate(async databaseName => {
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const db = await open()
  const put = (store, rows) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    for (const row of rows) tx.objectStore(store).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  const today = new Date()
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const uid = () => crypto.randomUUID()
  // 覆盖当前周：以本周一为基准向前后各铺一周，保证周视图的每一列都有数据。
  const monday = new Date(today)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const dates = Array.from({ length: 21 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index - 7)
    return key(date)
  })
  const many = (store, build) => put(store, dates.flatMap(date => Array.from({ length: 7 }, (_, index) => build(date, index, uid()))))
  await many('meals', (date, index, id) => ({ id, date, kind: '加餐', time: `0${index + 1}:00`.slice(-5), food: `很长的测试食物名称第 ${index + 1} 份`, spent: 12.5 }))
  await many('entertainment', (date, index, id) => ({ id, date, category: '游戏', title: `很长的娱乐项目名称第 ${index + 1} 个`, plannedTime: `1${index}:00`, plannedMinutes: 60, actualMinutes: 30 }))
  await many('badminton', (date, index, id) => ({ id, date, start: '18:00', end: '19:00', balls: 3, training: `很长的高远球训练内容第 ${index + 1} 组`, feeling: '还不错' }))
  await put('occurrences', dates.flatMap(date => Array.from({ length: 7 }, (_, index) => ({
    id: uid(), templateId: uid(), date, time: `0${index + 1}:00`.slice(-5),
    title: `很长的计划标题第 ${index + 1} 项`, minutes: 30, difficulty: 'easy', status: 'pending', percentage: null,
  }))))
  db.close()
}, name)

const inspect = async (page, listSelector, chipSelector) => page.evaluate(([list, chip]) => {
  const columns = [...document.querySelectorAll(list)]
  const grid = document.querySelector('.tasks-week-grid')
  const surface = document.querySelector('.tasks-calendar-surface')
  const gridBox = grid.getBoundingClientRect()
  const surfaceBox = surface.getBoundingClientRect()
  return {
    columnCount: columns.length,
    overflow: columns.map(column => {
      const box = column.getBoundingClientRect()
      const items = [...column.querySelectorAll(`${chip}, .tasks-more`)].map(node => node.getBoundingClientRect())
      const lowest = items.length ? Math.max(...items.map(item => item.bottom)) : box.top
      const more = column.querySelector('.tasks-more')
      const moreBox = more?.getBoundingClientRect()
      return {
        chips: column.querySelectorAll(chip).length,
        more: more?.textContent?.trim() || '',
        // 提示行被 overflow 裁掉时会失去宽度/高度，用它判断提示是否真的可见。
        moreVisible: Boolean(moreBox && moreBox.width > 30 && moreBox.height > 6),
        // 列内最后一个元素是否越过列底（负值/很小 = 没有溢出）
        spill: lowest - box.bottom,
        scrolls: column.scrollHeight - column.clientHeight,
      }
    }),
    // 日历框是否被内容顶高
    gridHeight: gridBox.height,
    surfaceHeight: surfaceBox.height,
  }
}, [listSelector, chipSelector])

test('周视图内容偏多时不溢出日历框，首页摘要卡片保持固定尺寸', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rhythm-stage22-'))
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
    await seed(page, dbName)
    await page.reload()

    const openPage = async name => {
      // 首页总览挂在 .brand 上，其余页面在导航栏里。
      if (name === '首页总览') {
        await page.locator('.brand').click()
        await page.locator('.home-layout').waitFor()
        return
      }
      await page.getByRole('navigation').getByRole('button', { name }).click()
      await page.waitForFunction(
        target => document.querySelector(`nav button[aria-label="${target}"]`)?.getAttribute('aria-current') === 'page',
        name,
      )
    }
    const toWeek = async () => {
      await page.locator('.tasks-view-switch').getByRole('button', { name: '周', exact: true }).click()
      await page.locator('.tasks-week-grid').waitFor()
    }

    // 先量一次「空内容」时的基准高度，后面用来证明内容变多也没有把框撑高。
    const baselines = {}
    for (const [name, chip, moreSuffix] of [
      ['今日计划', '.task-calendar-chip', '项'],
      ['饮食计划', '.life-food-chip', '餐'],
      ['游戏娱乐', '.life-fun-chip', '条'],
      ['羽毛球', '.life-badminton-chip', '场'],
    ]) {
      await openPage(name)
      await toWeek()
      const result = await inspect(page, '.tasks-week-column', chip)
      baselines[name] = result.surfaceHeight

      assert.equal(result.columnCount, 7, `${name} 周视图有 7 列`)
      for (const [index, column] of result.overflow.entries()) {
        // 「今日计划」每次打开都会按重复规则补生成实例，具体条数不固定；
        // 这里只要求：有内容时最多显示 3 条、提示行与显示条数相加等于总条数。
        assert.ok(column.chips <= 3, `${name} 第 ${index + 1} 列最多显示 3 条（实际 ${column.chips}）`)
        if (column.chips > 0) {
          const hidden = Number(new RegExp(`^还有 (\\d+) ${moreSuffix}`).exec(column.more)?.[1] ?? NaN)
          assert.ok(Number.isFinite(hidden), `${name} 第 ${index + 1} 列用「还有 N ${moreSuffix}」收尾（实际「${column.more}」）`)
          assert.ok(hidden > 0, `${name} 第 ${index + 1} 列的省略条数为正（实际 ${hidden}）`)
        }
        assert.equal(column.moreVisible, true, `${name} 第 ${index + 1} 列的省略提示没有被裁掉`)
        // 允许 1px 亚像素误差
        assert.ok(column.spill <= 1, `${name} 第 ${index + 1} 列内容没有溢出列底（越界 ${column.spill.toFixed(2)}px）`)
        assert.ok(column.scrolls <= 1, `${name} 第 ${index + 1} 列没有隐藏滚动内容（${column.scrolls}px）`)
        const box = await page.locator('.tasks-calendar-surface').boundingBox()
        const columnBox = await page.locator('.tasks-week-column').nth(index).boundingBox()
        assert.ok(
          columnBox.y + columnBox.height <= box.y + box.height + 1,
          `${name} 第 ${index + 1} 列仍在日历框内`,
        )
      }
      assert.ok(result.gridHeight <= 531, `${name} 周视图网格高度固定（${result.gridHeight.toFixed(1)}px）`)
    }

    // 首页：当天塞满 6 条记录后，摘要卡片仍然固定尺寸。
    await openPage('首页总览')
    // 等有列表的两张卡片（饮食／娱乐）挂上正文区（数据是异步从 IndexedDB 读出来的）。
    await page.waitForFunction(() => document.querySelectorAll('.home-note-scroll').length === 2)
    const cards = await page.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect()
        return { width: box.width, height: box.height, top: box.top, bottom: box.bottom }
      }
      const body = selector => {
        const el = document.querySelector(selector)
        return {
          overflow: el.scrollHeight - el.clientHeight,
          lines: el.querySelectorAll('.home-line').length,
          more: el.querySelector('.home-more-line')?.textContent?.trim() || '',
          // 正文区高度固定（3 条正文 + 1 行汇总），不随记录多少变化。
          height: getComputedStyle(el).height,
        }
      }
      return {
        food: rect('.home-note-food'),
        fun: rect('.home-note-fun'),
        ball: rect('.home-note-ball'),
        foodBody: body('.home-note-food .home-note-scroll'),
        funBody: body('.home-note-fun .home-note-scroll'),
      }
    })

    // 三张卡片高度一致（同一行等高，且不随内容变长）。
    for (const key of ['fun', 'ball']) {
      assert.ok(Math.abs(cards[key].height - cards.food.height) <= 1, `${key} 卡片与饮食卡片等高`)
    }
    assert.ok(cards.food.height <= 320, `饮食卡片保持固定高度（${cards.food.height.toFixed(1)}px）`)

    // 正文被限制在 3 条 + 1 行汇总（多出来的那条用省略号行收尾）。
    for (const [label, body] of [['饮食', cards.foodBody], ['娱乐', cards.funBody]]) {
      assert.ok(body.overflow <= 1, `${label}卡片正文没有溢出裁切（${body.overflow}px）`)
      assert.ok(body.lines <= 4, `${label}卡片正文最多 4 行（实际 ${body.lines}）`)
      assert.match(body.more, /^还有 [1-9]\d* (餐|条)…$/, `${label}卡片显示省略提示（实际「${body.more}」）`)
      // 固定高度：正文区自身有确定高度，而不是靠 max-height 兜底。
      assert.match(body.height, /^\d+(\.\d+)?px$/, `${label}卡片正文区高度固定（${body.height}）`)
      assert.notEqual(body.height, 'auto', `${label}卡片正文区高度不由内容决定`)
    }

    // 首页卡片高度与「只有一条记录」时相同：证明内容多少不影响卡片尺寸。
    await page.evaluate(async databaseName => {
      const request = indexedDB.open(databaseName)
      const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result) })
      await new Promise(resolve => {
        const tx = db.transaction(['meals', 'entertainment', 'badminton'], 'readwrite')
        for (const store of ['meals', 'entertainment', 'badminton']) tx.objectStore(store).clear()
        tx.oncomplete = () => resolve()
      })
      db.close()
    }, dbName)
    await page.reload()
    await page.locator('.home-note-scroll').first().waitFor()
    const empty = await page.evaluate(() => ({
      food: document.querySelector('.home-note-food').getBoundingClientRect().height,
      more: document.querySelectorAll('.home-more-line').length,
    }))
    assert.ok(Math.abs(empty.food - cards.food.height) <= 1, `记录清空后卡片高度不变（${empty.food.toFixed(1)} vs ${cards.food.height.toFixed(1)}）`)
    assert.equal(empty.more, 0, '没有多余记录时不显示省略提示')
  } finally {
    await browser?.close()
    server.kill()
    await rm(profile, { recursive: true, force: true })
  }
})

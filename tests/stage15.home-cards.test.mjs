import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:8765'
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

test('首页卡片在桌面和窄屏可读，背景、备忘录和记录入口可用', async () => {
  const server = spawn(process.execPath, ['launcher/serve.cjs', '--no-open'], { cwd: process.cwd() })
  let browser
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if ((await fetch(origin)).ok) { ready = true; break }
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    assert.equal(ready, true, '本地页面能够打开')
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(origin)
    await page.evaluate(() => document.fonts.ready)

    const planImage = page.locator('.home-plan .home-art img')
    assert.equal(await planImage.count(), 1, '今日计划保留插画')
    assert.equal(await planImage.getAttribute('src'), '/cards/plan-poster.jpg')
    assert.equal((await page.request.get(`${origin}/cards/plan-poster.jpg`)).ok(), true, 'plan-poster.jpg 可读取')
    assert.equal(await planImage.evaluate(img => img.complete && img.naturalWidth > 0), true, '计划插画可以加载')

    for (const [card, file] of [
      ['home-note-food', 'food-poster.jpg'],
      ['home-note-fun', 'fun-poster.png'],
      ['home-note-ball', 'sport-poster.jpg'],
    ]) {
      const section = page.locator(`.${card}`)
      assert.equal(await section.locator('.home-art').count(), 0, `${card} 不再使用上方绘画框`)
      assert.match(await section.evaluate(el => getComputedStyle(el).backgroundImage), new RegExp(file), `${card} 使用整张背景`)
      assert.equal((await page.request.get(`${origin}/cards/${file}`)).ok(), true, `${file} 可以读取`)
    }
    assert.equal(await page.locator('.home-note-food h2').textContent(), '今日饮食')
    assert.equal(await page.locator('.home-note-fun h2').textContent(), '游戏娱乐')
    assert.equal(await page.locator('.home-note-ball h2').textContent(), '运动健康')

    const memo = page.locator('.home-memo')
    assert.equal(await memo.locator('.home-art').count(), 0, '备忘录不再显示旧绘画框')
    assert.equal(await memo.locator('.memo-paperclip').count(), 1, '备忘录保留纸夹')
    assert.equal(await memo.locator('.memo-paper').evaluate(el => getComputedStyle(el).clipPath !== 'none'), true, '备忘录纸张保留撕边')
    assert.match(await memo.locator('textarea').evaluate(el => getComputedStyle(el).backgroundImage), /repeating-linear-gradient/, '备忘录书写区保留横线')
    await page.locator('#quick-memo').fill('在纸上记一条')
    await memo.getByRole('button', { name: '保存备忘' }).click()
    await page.getByRole('status').waitFor()
    await page.reload()
    await page.waitForFunction(() => document.querySelector('#quick-memo')?.value === '在纸上记一条')
    assert.equal(await page.locator('#quick-memo').inputValue(), '在纸上记一条', '备忘录刷新后保留')

    async function backgroundsLeaveRoomForCopy() {
      for (const [cardClass, copyClass, expectedColor, expectedGlass] of [
        ['home-note-food', 'home-food-copy', 'rgb(168, 74, 12)', true],
        ['home-note-fun', 'home-fun-copy', 'rgb(44, 53, 87)', false],
        ['home-note-ball', 'home-sport-copy', 'rgb(255, 253, 245)', false],
      ]) {
        const card = page.locator(`.${cardClass}`)
        const composition = await card.evaluate((el, innerClass) => {
          const copy = el.querySelector(`.${innerClass}`)
          const outer = el.getBoundingClientRect()
          const inner = copy.getBoundingClientRect()
          const styles = getComputedStyle(copy)
          return {
            copyWidth: inner.width,
            imageWidth: outer.width,
            remainingWidth: outer.right - inner.right,
            color: styles.color,
            background: styles.backgroundImage,
            borderTopWidth: styles.borderTopWidth,
            backdropFilter: styles.backdropFilter,
            paddingTop: styles.paddingTop,
          }
        }, copyClass)
        assert.ok(composition.remainingWidth > 0 && composition.copyWidth < composition.imageWidth * .7, `${cardClass} 为背景图留出空间`)
        assert.equal(composition.color, expectedColor, `${cardClass} 保持预期文字颜色`)
        if (expectedGlass) {
          assert.match(composition.background, /rgba\(/, `${cardClass} 保留低透明度玻璃文字层`)
        } else {
          assert.equal(composition.background, 'none', `${cardClass} 没有额外文字背景框`)
          assert.equal(composition.borderTopWidth, '0px', `${cardClass} 没有文字边框`)
          assert.equal(composition.backdropFilter, 'none', `${cardClass} 没有文字模糊层`)
          if (cardClass === 'home-note-ball') {
            // 文字必须落在绿色草坡上：顶部留白要越过插画上方的蓝天（约 69px），
            // 桌面 82px、窄屏 80px，都留有余量。
            assert.ok(parseFloat(composition.paddingTop) >= 80, `${cardClass} 文字位于绿色背景区域`)
          }
        }
      }
    }

    await backgroundsLeaveRoomForCopy()
    // 游戏娱乐卡片文字统一为插画同色系的靛蓝：标题、正文、底部入口三者一致。
    const funTextColors = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector('.home-note-fun .home-poster-title')).color,
      body: getComputedStyle(document.querySelector('.home-note-fun .home-note-empty, .home-note-fun .home-note-body .home-line')).color,
      action: getComputedStyle(document.querySelector('.home-note-fun .button-link')).color,
    }))
    for (const [part, color] of Object.entries(funTextColors)) {
      assert.equal(color, 'rgb(44, 53, 87)', `游戏娱乐${part} 使用统一的靛蓝文字`)
    }

    const desktopGeometry = await page.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect()
        return { width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      }
      return {
        plan: rect('.home-plan'),
        memo: rect('.home-memo'),
        food: rect('.home-note-food'),
        fun: rect('.home-note-fun'),
        ball: rect('.home-note-ball'),
      }
    })
    for (const [name, card] of Object.entries({
      memo: desktopGeometry.memo,
      food: desktopGeometry.food,
      fun: desktopGeometry.fun,
      ball: desktopGeometry.ball,
    })) {
      assert.ok(Math.abs(card.width - desktopGeometry.food.width) <= 1, `${name} 宽度与右侧卡片统一`)
      assert.ok(Math.abs(card.height - desktopGeometry.food.height) <= 1, `${name} 高度与右侧卡片统一`)
    }
    // 间距从 CSS 读取，避免写死数值：右侧卡片可以靠加大间距一起缩小，
    // 只要四张卡片外沿仍与今日计划卡片上下对齐即可。
    const noteGap = await page.locator('.home-notes').evaluate(
      el => Number.parseFloat(getComputedStyle(el).rowGap),
    )
    assert.ok(noteGap >= 48, `右侧卡片间距已拉大到 48px（当前 ${noteGap}px）`)
    // 今日计划卡片与右列同高（align-items: stretch），右列两行等高，
    // 所以 plan.height 应等于 2 × 卡片高 + 行间距。
    // 断言里带上实测值，失败时能直接看出差在哪里。
    const columnHeight = desktopGeometry.food.height * 2 + noteGap
    // 两张卡片各可能有 0.5px 的亚像素取整，容差取 2px。
    assert.ok(
      Math.abs(desktopGeometry.plan.height - columnHeight) <= 2,
      `今日计划高度与右侧 2×2 卡片总高度对齐（今日计划 ${desktopGeometry.plan.height.toFixed(2)}，`
      + `卡片 ${desktopGeometry.food.height.toFixed(2)} × 2 + 间距 ${noteGap} = ${columnHeight.toFixed(2)}）`,
    )
    // 四张卡片外沿必须与左侧今日计划卡片齐平：上下贴齐整列，右侧贴齐布局右缘。
    for (const [name, card] of Object.entries({
      memo: desktopGeometry.memo,
      food: desktopGeometry.food,
      fun: desktopGeometry.fun,
      ball: desktopGeometry.ball,
    })) {
      assert.ok(Math.abs(card.right - desktopGeometry.plan.right) <= 1, `${name} 右外沿与今日计划齐平`)
    }
    assert.ok(Math.abs(desktopGeometry.memo.top - desktopGeometry.plan.top) <= 1, '右上卡片上沿与今日计划齐平')
    assert.ok(Math.abs(desktopGeometry.fun.bottom - desktopGeometry.plan.bottom) <= 1, '右下卡片下沿与今日计划齐平')
    // 右侧 2×2 整体右移 8px：左列收窄 8px、右列变宽 8px，两列合计不变。
    // 用「左列宽度 + 间距 + 右列宽度 = 版心宽度」来校验版心没有被撑宽。
    const layoutWidths = await page.locator('.home-layout').evaluate((el) => {
      const styles = getComputedStyle(el)
      const left = el.querySelector('.home-plan').getBoundingClientRect().width
      const right = el.querySelector('.home-col-side').getBoundingClientRect().width
      return { left, right, gap: Number.parseFloat(styles.columnGap), total: el.getBoundingClientRect().width }
    })
    assert.ok(
      Math.abs(layoutWidths.left + layoutWidths.gap + layoutWidths.right - layoutWidths.total) <= 1,
      '左列 + 间距 + 右列等于版心宽度（右侧右移没有撑宽版心）',
    )
    assert.ok(layoutWidths.right > layoutWidths.left, '右列比左列宽，2×2 组合位于版心右侧')

    const inlineActions = page.locator('.home-inline-action')
    assert.equal(await inlineActions.count(), 2, '空状态入口存在')
    for (const action of await inlineActions.all()) {
      assert.equal(await action.evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap', '空状态入口保持一行')
    }
    assert.match(await page.locator('.home-plan').evaluate(el => getComputedStyle(el).backgroundImage), /rgba\(/, '卡片保持半透明便于透出壁纸')
    if (process.env.CARD_PREVIEW) await page.screenshot({ path: `${process.env.CARD_PREVIEW}/home-desktop.png`, fullPage: true })

    await page.locator('.home-note-food .button-link').click()
    await page.getByRole('heading', { name: '饮食计划' }).waitFor()
    await page.locator('.brand').click()
    await page.getByRole('heading', { name: '首页总览' }).waitFor()
    await page.locator('.home-note-ball .button-link').click()
    await page.getByRole('heading', { name: '羽毛球' }).waitFor()
    await page.locator('.brand').click()
    await page.getByRole('heading', { name: '首页总览' }).waitFor()

    await page.setViewportSize({ width: 390, height: 844 })
    await backgroundsLeaveRoomForCopy()
    assert.equal(await memo.locator('.memo-paperclip').isVisible(), true, '窄屏纸夹仍可见')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '窄屏没有横向滚动')
    for (const card of await page.locator('.home-sheet').all()) assert.equal(await card.isVisible(), true)
    if (process.env.CARD_PREVIEW) await page.screenshot({ path: `${process.env.CARD_PREVIEW}/home-mobile.png`, fullPage: true })

    await page.evaluate(() => { document.documentElement.dataset.theme = 'focus' })
    assert.equal(await page.locator('.home-plan .home-sheet-head h2').isVisible(), true)
    assert.match(await page.locator('.home-plan').evaluate(el => getComputedStyle(el).backgroundImage), /gradient/)
    const memoButton = await memo.getByRole('button', { name: '保存备忘' }).evaluate(el => ({
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
    }))
    assert.equal(memoButton.color, 'rgb(255, 249, 235)', '深色主题按钮文字清晰')
    assert.equal(memoButton.background, 'rgb(113, 81, 59)', '深色主题按钮保持铜棕色')
    if (process.env.CARD_PREVIEW) await page.screenshot({ path: `${process.env.CARD_PREVIEW}/home-focus.png`, fullPage: true })
  } finally {
    await browser?.close()
    server.kill()
  }
})

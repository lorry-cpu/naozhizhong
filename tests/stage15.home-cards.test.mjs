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

    // 插画右下角的切换按钮：可打开弹窗、切换内置插画、刷新后仍保留、可恢复默认。
    const artSwitch = page.locator('.home-art-switch')
    assert.equal(await artSwitch.count(), 1, '今日计划插画带切换按钮')
    assert.equal(await artSwitch.getAttribute('aria-label'), '更换今日计划插画', '切换按钮有无障碍名称')
    const artBox = await page.evaluate(() => {
      const art = document.querySelector('.home-plan .home-art').getBoundingClientRect()
      const btn = document.querySelector('.home-art-switch').getBoundingClientRect()
      return { insideRight: art.right - btn.right, insideBottom: art.bottom - btn.bottom, w: btn.width, h: btn.height }
    })
    assert.ok(artBox.insideRight >= 0 && artBox.insideBottom >= 0, '切换按钮位于插画内部')
    assert.ok(artBox.w >= 24 && artBox.h >= 24, `切换按钮是可点击尺寸（${artBox.w.toFixed(0)}×${artBox.h.toFixed(0)}）`)

    await artSwitch.click()
    await page.getByRole('dialog').waitFor()
    assert.equal(await page.locator('#plan-art-dialog-title').textContent(), '选择首页插画')
    assert.equal(await page.locator('.plan-art-option').count(), 2, '提供两张内置插画')
    await page.locator('.plan-art-option').nth(1).click()
    await page.getByRole('button', { name: '完成' }).click()
    await page.waitForFunction(() => document.querySelector('.home-plan .home-art img')?.getAttribute('src') === '/cards/plan.svg')
    assert.equal(await planImage.getAttribute('src'), '/cards/plan.svg', '切换到第二张内置插画')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.home-plan .home-art img')?.getAttribute('src') === '/cards/plan.svg')
    assert.equal(await planImage.getAttribute('src'), '/cards/plan.svg', '插画选择在刷新后保留')
    await page.locator('.home-art-switch').click()
    await page.getByRole('button', { name: '恢复默认插画' }).click()
    await page.waitForFunction(() => document.querySelector('.home-plan .home-art img')?.getAttribute('src') === '/cards/plan-poster.jpg')
    assert.equal(await planImage.getAttribute('src'), '/cards/plan-poster.jpg', '可以恢复默认插画')
    await page.getByRole('button', { name: '完成' }).click()

    // 导入本地图片：存成 DataURL，刷新后仍生效。
    await page.locator('.home-art-switch').click()
    await page.locator('#plan-art-file').setInputFiles({
      name: 'custom.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await page.waitForFunction(() => document.querySelector('.home-plan .home-art img')?.getAttribute('src')?.startsWith('data:image/png;base64,'))
    assert.match(await planImage.getAttribute('src'), /^data:image\/png;base64,/, '导入的本地图片成为卡片插画')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.home-plan .home-art img')?.getAttribute('src')?.startsWith('data:image/png;base64,'))
    assert.equal(await planImage.evaluate(img => img.complete && img.naturalWidth > 0), true, '导入的图片刷新后仍能加载')
    await page.locator('.home-art-switch').click()
    await page.getByRole('button', { name: '恢复默认插画' }).click()
    await page.waitForFunction(() => document.querySelector('.home-plan .home-art img')?.getAttribute('src') === '/cards/plan-poster.jpg')
    await page.getByRole('button', { name: '完成' }).click()

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
    // 运动健康卡片是白字压在插画上，插画里同时有蓝天、亮草坡和白色小路，
    // 没有阴影时最亮处的对比只有约 1.1:1（基本看不清）。
    // 这里守住「多层深色阴影」这个补偿手段，防止被误删。
    const sportShadow = await page.locator('.home-note-ball .home-sport-copy').evaluate(
      el => getComputedStyle(el).textShadow,
    )
    const shadowLayers = sportShadow.split(/,(?![^(]*\))/).filter(part => part.trim()).length
    assert.ok(shadowLayers >= 3, `运动健康文字保留多层阴影以压住插画亮部（当前 ${shadowLayers} 层）`)
    assert.match(sportShadow, /rgba?\(/, '阴影带透明度，避免生硬黑边')

    // 游戏娱乐卡片：标题与正文用插画同色系的靛蓝；
    // 底部入口压在插画的深色地毯上，改用白色字，不再加阴影描边。
    const funTextColors = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector('.home-note-fun .home-poster-title')).color,
      body: getComputedStyle(document.querySelector('.home-note-fun .home-note-empty, .home-note-fun .home-note-body .home-line')).color,
      action: getComputedStyle(document.querySelector('.home-note-fun .button-link')).color,
      actionShadow: getComputedStyle(document.querySelector('.home-note-fun .button-link')).textShadow,
    }))
    assert.equal(funTextColors.title, 'rgb(44, 53, 87)', '游戏娱乐标题使用统一的靛蓝文字')
    assert.equal(funTextColors.body, 'rgb(44, 53, 87)', '游戏娱乐正文使用统一的靛蓝文字')
    assert.equal(funTextColors.action, 'rgb(255, 255, 255)', '游戏娱乐底部入口使用白色文字')
    assert.equal(funTextColors.actionShadow, 'none', '游戏娱乐底部入口不加阴影')

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
    //
    // 注意：页面整体有 zoom（.app-shell 的 --ui-scale），getBoundingClientRect()
    // 返回的是缩放后的像素，而 getComputedStyle().rowGap 是未经缩放的 CSS 值。
    // 两者不能直接相加，所以这里直接从两个卡片的实际位置量出间距。
    const noteGap = await page.locator('.home-notes').evaluate(
      el => Number.parseFloat(getComputedStyle(el).rowGap),
    )
    assert.ok(noteGap >= 48, `右侧卡片间距已拉大到 48px（当前 ${noteGap}px）`)
    const renderedGap = await page.evaluate(() => {
      const food = document.querySelector('.home-note-food').getBoundingClientRect()
      const fun = document.querySelector('.home-note-fun').getBoundingClientRect()
      return fun.top - food.bottom
    })
    // 今日计划卡片与右列同高（align-items: stretch），右列两行等高，
    // 所以 plan.height 应等于 2 × 卡片高 + 实际间距。
    // 断言里带上实测值，失败时能直接看出差在哪里。
    const columnHeight = desktopGeometry.food.height * 2 + renderedGap
    // 两张卡片各可能有 0.5px 的亚像素取整，容差取 2px。
    assert.ok(
      Math.abs(desktopGeometry.plan.height - columnHeight) <= 2,
      `今日计划高度与右侧 2×2 卡片总高度对齐（今日计划 ${desktopGeometry.plan.height.toFixed(2)}，`
      + `卡片 ${desktopGeometry.food.height.toFixed(2)} × 2 + 实际间距 ${renderedGap.toFixed(2)} = ${columnHeight.toFixed(2)}）`,
    )
    // 版式：左侧「今日计划」独占一列，右侧 2×2 网格（memo/food 第一行，fun/ball 第二行）。
    // 所以四张卡片的右缘都对不齐 plan.right（那是左列的右缘），
    // 真正该成立的是：整列 2×2 的右缘 == 布局右缘，左缘 == 布局中线之后，
    // 且两行卡片各自上下填满整列高度。
    const layout = await page.locator('.home-layout').evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, width: b.width }
    })
    const notesBox = await page.locator('.home-notes').evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width }
    })
    assert.ok(Math.abs(notesBox.right - layout.right) <= 1, '右侧 2×2 贴合布局右缘')
    assert.ok(notesBox.left > desktopGeometry.plan.right, '右侧 2×2 排在今日计划卡片之后')
    assert.ok(
      notesBox.width > desktopGeometry.plan.width,
      `右侧 2×2 比左侧今日计划更宽（${notesBox.width.toFixed(1)} > ${desktopGeometry.plan.width.toFixed(1)}）`,
    )
    // 2×2 内部：memo/fun 在左列，food/ball 在右列。只有右列贴到网格右缘。
    assert.ok(Math.abs(desktopGeometry.food.right - notesBox.right) <= 1, 'food 在网格右列，贴齐网格右缘')
    assert.ok(Math.abs(desktopGeometry.ball.right - notesBox.right) <= 1, 'ball 在网格右列，贴齐网格右缘')
    assert.ok(Math.abs(desktopGeometry.memo.right - desktopGeometry.fun.right) <= 1, 'memo/fun 同处网格左列，右缘一致')
    assert.ok(desktopGeometry.memo.right < desktopGeometry.food.left, '左列卡片右缘在右列卡片左缘之前')
    // 左列两张（memo/fun）右缘 = 右列两张左缘 - 列间距
    // 注意 zoom：rect 是缩放后的像素，computed 的 columnGap 是未缩放的 CSS 值，
    // 所以间距要乘上页面缩放系数再比较。
    const uiScale = await page.locator('.app-shell').evaluate(
      el => Number.parseFloat(getComputedStyle(el).zoom) || 1,
    )
    const colGap = await page.locator('.home-notes').evaluate(
      el => Number.parseFloat(getComputedStyle(el).columnGap),
    )
    assert.ok(
      Math.abs(desktopGeometry.food.left - desktopGeometry.memo.right - colGap * uiScale) <= 2,
      `两列之间留有列间距（memo.right ${desktopGeometry.memo.right.toFixed(2)} → food.left ${desktopGeometry.food.left.toFixed(2)}，间距 ${colGap}×${uiScale}）`,
    )
    assert.ok(Math.abs(desktopGeometry.memo.top - desktopGeometry.plan.top) <= 1, '第一行卡片上沿与今日计划齐平')
    assert.ok(Math.abs(desktopGeometry.fun.bottom - desktopGeometry.plan.bottom) <= 1, '第二行卡片下沿与今日计划齐平')
    // 右侧 2×2 整体右移 8px：左列收窄 8px、右列变宽 8px，两列合计不变。
    // 用「左列宽度 + 实际间距 + 右列宽度 = 版心宽度」校验版心没有被撑宽。
    // 间距同样从实际位置量取（computed 的 columnGap 未缩放，不能直接与 rect 相加）。
    const layoutWidths = await page.locator('.home-layout').evaluate((el) => {
      const leftBox = el.querySelector('.home-plan').getBoundingClientRect()
      const rightBox = el.querySelector('.home-col-side').getBoundingClientRect()
      const totalBox = el.getBoundingClientRect()
      return {
        left: leftBox.width,
        right: rightBox.width,
        renderedGap: rightBox.left - leftBox.right,
        total: totalBox.width,
      }
    })
    assert.ok(
      Math.abs(layoutWidths.left + layoutWidths.renderedGap + layoutWidths.right - layoutWidths.total) <= 1,
      `左列 + 间距 + 右列等于版心宽度（${layoutWidths.left.toFixed(2)} + ${layoutWidths.renderedGap.toFixed(2)}`
      + ` + ${layoutWidths.right.toFixed(2)} = ${(layoutWidths.left + layoutWidths.renderedGap + layoutWidths.right).toFixed(2)}`
      + ` vs ${layoutWidths.total.toFixed(2)}）`,
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

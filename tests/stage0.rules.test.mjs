import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextMidnight, localDateKey, THEMES, FONTS } from '../src/domain/rules.ts'

test('本地日历日跨月份和年份，而不是用固定小时数', () => {
  assert.equal(localDateKey(new Date(nextMidnight('2026-09-24'))), '2026-09-25')
  assert.equal(localDateKey(new Date(nextMidnight('2026-12-31'))), '2027-01-01')
  assert.throws(() => nextMidnight('2026-02-30'))
})

// 金币机制已移除：风格与字体不再有价格，也不再有解锁概念。
test('风格与字体都不带价格，可自由切换', () => {
  assert.deepEqual(THEMES.map(theme => theme.id), ['warm', 'cool', 'focus'])
  for (const theme of THEMES) assert.equal('price' in theme, false, `${theme.id} 不应再有价格字段`)
  for (const font of FONTS) assert.equal('price' in font, false, `${font.id} 不应再有价格字段`)
})

// 只保留可自由分发的开源字体（SIL OFL 1.1）；商业字体已移除。
test('只保留两种开源字体', () => {
  assert.deepEqual(FONTS.map(font => font.id), ['source-han-serif', 'source-han-sans'])
})

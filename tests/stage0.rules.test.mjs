import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewardCap, payoutFor, nextMidnight, localDateKey, THEMES } from '../src/domain/rules.ts'

test('金币按难度与向上取整的 30 分钟档计算，拒绝无效输入', () => {
  assert.deepEqual([1, 30, 31, 60].map(minutes => rewardCap(minutes, 'easy')), [6, 6, 12, 12])
  assert.equal(rewardCap(60, 'medium'), 20)
  assert.equal(rewardCap(60, 'hard'), 28)
  assert.throws(() => rewardCap(0, 'easy'))
  assert.throws(() => rewardCap(12.5, 'easy'))
})

test('完成比例两侧的边界都有明确收益或惩罚', () => {
  assert.deepEqual([0, 30, 49, 50, 100].map(p => payoutFor(20, p)), [-20, -8, -1, 10, 20])
  assert.equal(payoutFor(6, 49), -1)
  assert.throws(() => payoutFor(20, -1))
  assert.throws(() => payoutFor(20, 101))
})

test('本地日历日跨月份和年份，而不是用固定小时数', () => {
  assert.equal(localDateKey(new Date(nextMidnight('2026-09-24'))), '2026-09-25')
  assert.equal(localDateKey(new Date(nextMidnight('2026-12-31'))), '2027-01-01')
  assert.throws(() => nextMidnight('2026-02-30'))
})

test('风格价格不使用原设计图中的演示价格', () => {
  assert.deepEqual(THEMES.map(theme => theme.price), [0, 90, 160])
})

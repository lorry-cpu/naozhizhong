import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskCsv, taskIcs } from '../src/domain/taskExport.ts'

test('CSV 对含逗号与引号的计划正确转义；日历事件跨日并保留本地开始时间', () => {
  const rows = [
    { id: 'task@2026-09-27', templateId: 'task', date: '2026-09-27', time: '23:30', title: '阅读,"手记"\n第二行', minutes: 90, difficulty: 'medium', status: 'settled', percentage: 75, payout: 12, settledAt: 1 },
    { id: 'removed@2026-09-27', templateId: 'removed', date: '2026-09-27', time: '08:00', title: '已取消', minutes: 15, difficulty: 'easy', status: 'cancelled', percentage: null, payout: null, settledAt: null },
  ]
  const csv = taskCsv(rows)
  assert.ok(csv.startsWith('\uFEFF"日期"'))
  assert.match(csv, /"阅读,""手记""\n第二行"/)
  assert.match(csv, /"75"/)
  assert.doesNotMatch(csv, /金币/)
  const ics = taskIcs(rows, '2026-09-27T12:34:56.000Z')
  assert.match(ics, /DTSTART:20260927T233000/)
  assert.match(ics, /DTEND:20260928T010000/)
  assert.match(ics, /SUMMARY:阅读\\\,"手记"\\n第二行/)
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1)
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
})

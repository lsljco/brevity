import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTimeframe, filterTransactionsByTimeframe } from './financeTimeframe.js'

const now = new Date(2026, 7, 15)
test('calendar-month presets resolve to complete inclusive local calendar ranges', () => {
  assert.deepEqual(resolveTimeframe('this-month', now), { preset: 'this-month', from: '2026-08-01', to: '2026-08-31' })
  assert.deepEqual(resolveTimeframe('last-month', now), { preset: 'last-month', from: '2026-07-01', to: '2026-07-31' })
  assert.deepEqual(resolveTimeframe('last-year', now), { preset: 'last-year', from: '2025-01-01', to: '2025-12-31' })
})

test('relative day, week, and next-month presets cover the requested planner ranges', () => {
  const now = new Date(2026, 7, 21, 10)
  assert.deepEqual(resolveTimeframe('today', now), { preset: 'today', from: '2026-08-21', to: '2026-08-21' })
  assert.deepEqual(resolveTimeframe('yesterday', now), { preset: 'yesterday', from: '2026-08-20', to: '2026-08-20' })
  assert.deepEqual(resolveTimeframe('tomorrow', now), { preset: 'tomorrow', from: '2026-08-22', to: '2026-08-22' })
  assert.deepEqual(resolveTimeframe('this-week', now), { preset: 'this-week', from: '2026-08-16', to: '2026-08-22' })
  assert.deepEqual(resolveTimeframe('last-week', now), { preset: 'last-week', from: '2026-08-09', to: '2026-08-15' })
  assert.deepEqual(resolveTimeframe('next-week', now), { preset: 'next-week', from: '2026-08-23', to: '2026-08-29' })
  assert.deepEqual(resolveTimeframe('next-month', now), { preset: 'next-month', from: '2026-09-01', to: '2026-09-30' })
})

test('transaction filtering includes both boundaries', () => {
  const range = { from: '2026-08-01', to: '2026-08-15' }
  const rows = [{ date: '2026-07-31' }, { date: '2026-08-01' }, { date: '2026-08-15' }, { date: '2026-08-16' }]
  assert.equal(filterTransactionsByTimeframe(rows, range).length, 2)
})

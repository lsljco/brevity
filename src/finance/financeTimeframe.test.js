import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTimeframe, filterTransactionsByTimeframe } from './financeTimeframe.js'

const now = new Date(2026, 7, 15)
test('timeframe presets resolve to inclusive local calendar dates', () => {
  assert.deepEqual(resolveTimeframe('this-month', now), { preset: 'this-month', from: '2026-08-01', to: '2026-08-15' })
  assert.deepEqual(resolveTimeframe('last-month', now), { preset: 'last-month', from: '2026-07-01', to: '2026-07-31' })
  assert.deepEqual(resolveTimeframe('last-year', now), { preset: 'last-year', from: '2025-01-01', to: '2025-12-31' })
})

test('transaction filtering includes both boundaries', () => {
  const range = { from: '2026-08-01', to: '2026-08-15' }
  const rows = [{ date: '2026-07-31' }, { date: '2026-08-01' }, { date: '2026-08-15' }, { date: '2026-08-16' }]
  assert.equal(filterTransactionsByTimeframe(rows, range).length, 2)
})

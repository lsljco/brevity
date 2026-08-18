import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyAlignmentSnapshot, emptyDailyAlignmentRecord, normalizeDailyAlignmentRecord } from './dailyAlignmentData.js'

const accounts = [{ id: 'operating', name: 'Operating', balance: 1000 }]
const scheduled = [
  { id: 'pay', name: 'Payroll', amount: 500, type: 'income', freq: 'once', start: '2026-08-18', cat: 'Income' },
  { id: 'bill', name: 'Utility', amount: 300, type: 'expense', freq: 'once', start: '2026-08-19', cat: 'Utilities' },
  { id: 'fun', name: 'Family Fun', amount: 310, type: 'expense', freq: 'monthly', start: '2026-08-18', cat: 'Discretionary' },
]

test('daily alignment separates posted cash from expected and near-term obligations', () => {
  const snapshot = buildDailyAlignmentSnapshot({
    date: '2026-08-18', accounts, scheduled,
    actuals: [{ id: 'actual-pay', name: 'Payroll deposit', amount: -500, date: '2026-08-18', pending: false }],
  })
  assert.equal(snapshot.availableOperatingCash, 1000)
  assert.equal(snapshot.expectedInflows, 0)
  assert.equal(snapshot.dueTodayTomorrow, 610)
  assert.equal(snapshot.movements.find(item => item.id === 'actual-pay').status, 'Posted')
  assert.equal(snapshot.movements.some(item => item.id === 'expected-pay'), false)
})

test('daily discretionary amount uses the remaining monthly budget and days', () => {
  const snapshot = buildDailyAlignmentSnapshot({
    date: '2026-08-18', accounts, scheduled,
    budget: { 'Family Fun': Array(12).fill(310) },
    actuals: [{ id: 'spent', name: 'Shopping', category: 'Discretionary', amount: 170, date: '2026-08-10' }],
  })
  assert.equal(snapshot.discretionaryBudget, 310)
  assert.equal(snapshot.discretionarySpent, 170)
  assert.equal(snapshot.approvedDiscretionary, 10)
})

test('daily records retain the four named owners and normalize partial saves', () => {
  assert.deepEqual(emptyDailyAlignmentRecord().actions.map(row => row.person), ['Larry', 'Lorenzo', 'Terica', 'Nyla'])
  const record = normalizeDailyAlignmentRecord({ actions: [{ person: 'Larry', action: 'Send proposal' }] })
  assert.equal(record.actions[0].action, 'Send proposal')
  assert.equal(record.actions[1].person, 'Lorenzo')
  assert.equal(record.decisions.length, 3)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyAlignmentSnapshot, calculateActualMonthToDateCashFlow, emptyDailyAlignmentRecord, normalizeDailyAlignmentRecord } from './dailyAlignmentData.js'

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

test('monthly cash flow can use operating transactions while daily activity follows the visible account', () => {
  const snapshot = buildDailyAlignmentSnapshot({
    date: '2026-09-04',
    accounts,
    scheduled: [{ id: 'visible-savings', amount: 900, type: 'income', freq: 'weekly', start: '2026-09-04' }],
    monthlyScheduled: [
      { id: 'operating-income', amount: 500, type: 'income', freq: 'monthly', start: '2026-09-04' },
      { id: 'operating-expense', amount: 200, type: 'expense', freq: 'monthly', start: '2026-09-04' },
    ],
  })

  assert.equal(snapshot.expectedInflows, 900)
  assert.equal(snapshot.monthlyIncome, 500)
  assert.equal(snapshot.monthlyExpenses, 200)
  assert.equal(snapshot.monthlyCashFlow, 300)
  assert.equal(snapshot.monthlyCashFlowSource, 'scheduled')
})

test('monthly goal progress uses posted and pending net cash flow instead of scheduled income', () => {
  const actuals = [
    { id: 'income', name: 'Deposits', amount: -26159.53, date: '2026-08-20', pending: false },
    { id: 'expenses', name: 'Monthly expenses', amount: 24265.32, date: '2026-08-27', pending: true },
    { id: 'transfer', name: 'Transfer to savings', category: 'TRANSFER_OUT', amount: 5000, date: '2026-08-27', pending: true },
    { id: 'future', name: 'Future expense', amount: 500, date: '2026-08-29', pending: true },
  ]

  const totals = calculateActualMonthToDateCashFlow(actuals, '2026-08-28')
  assert.equal(totals.income, 26159.53)
  assert.equal(totals.expenses, 24265.32)
  assert.ok(Math.abs(totals.cashFlow - 1894.21) < 0.001)
  assert.equal(totals.transactionCount, 2)

  const snapshot = buildDailyAlignmentSnapshot({
    date: '2026-08-28',
    accounts,
    scheduled: [],
    monthlyScheduled: [{ id: 'scheduled-income', amount: 50000, type: 'income', freq: 'monthly', start: '2026-08-01' }],
    actuals,
  })

  assert.equal(snapshot.monthlyIncome, 26159.53)
  assert.equal(snapshot.monthlyExpenses, 24265.32)
  assert.ok(Math.abs(snapshot.monthlyCashFlow - 1894.21) < 0.001)
  assert.equal(snapshot.monthlyCashFlowSource, 'actual')
})

test('daily records retain the four named owners and normalize partial saves', () => {
  assert.deepEqual(emptyDailyAlignmentRecord().actions.map(row => row.person), ['Larry', 'Lorenzo', 'Terica', 'Nyla'])
  const record = normalizeDailyAlignmentRecord({ actions: [{ person: 'Larry', action: 'Send proposal' }] })
  assert.equal(record.actions[0].action, 'Send proposal')
  assert.equal(record.actions[1].person, 'Lorenzo')
  assert.equal(record.decisions.length, 3)
})

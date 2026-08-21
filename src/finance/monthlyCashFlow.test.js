import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMonthlyCashFlow,
  calculateScheduledTotalsForMonth,
  calculateTransactionAmountForMonth,
  selectOperatingTransactions,
} from './monthlyCashFlow.js'

test('selects the operating account independently of the visible account filter', () => {
  const accounts = [
    { id: 'operating-custom', name: 'Household Operating Account (...2200)' },
    { id: 'savings', name: 'LSLJ Savings' },
  ]
  const transactions = [
    { id: 'operating-income', acct: 'operating-custom' },
    { id: 'legacy-operating-income', acct: 'a1' },
    { id: 'savings-interest', acct: 'savings' },
  ]

  assert.deepEqual(
    selectOperatingTransactions(accounts, transactions).map(transaction => transaction.id),
    ['operating-income', 'legacy-operating-income'],
  )
})

test('counts actual monthly occurrences and respects mid-month income endings', () => {
  const transactions = [
    { id: 'mativ', amount: 200, type: 'income', freq: 'weekly', start: '2026-07-03', end: '2026-09-18' },
    { id: 'crh', amount: 100, type: 'income', freq: 'weekly', start: '2026-09-04', end: '' },
    { id: 'mortgage', amount: 500, type: 'expense', freq: 'monthly', start: '2026-07-05', end: '' },
  ]

  const result = calculateMonthlyCashFlow(transactions, '2026-09-01')

  assert.deepEqual(result, {
    income: 1000,
    recurringExpenses: 500,
    cashFlow: 500,
  })
})

test('excludes transfers, one-time items, and skipped occurrences', () => {
  const result = calculateMonthlyCashFlow([
    { id: 'income', amount: 100, type: 'income', freq: 'weekly', start: '2026-09-04', skips: ['2026-09-11'] },
    { id: 'bonus', amount: 900, type: 'income', freq: 'once', start: '2026-09-10' },
    { id: 'transfer', amount: 300, type: 'transfer', freq: 'weekly', start: '2026-09-04' },
    { id: 'bill', amount: 50, type: 'expense', freq: 'weekly', start: '2026-09-04' },
  ], '2026-09-01')

  assert.deepEqual(result, {
    income: 300,
    recurringExpenses: 200,
    cashFlow: 100,
  })
})

test('scheduled month totals include one-time items for statements but recurring budgets can exclude them', () => {
  const transactions = [
    { id: 'weekly', amount: 100, type: 'income', freq: 'weekly', start: '2026-08-07', end: '2026-08-21' },
    { id: 'one-time', amount: 250, type: 'income', freq: 'once', start: '2026-08-10' },
    { id: 'quarterly', amount: 600, type: 'expense', freq: 'quarterly', start: '2026-08-05' },
  ]

  assert.equal(calculateTransactionAmountForMonth(transactions[0], '2026-08-01'), 300)
  assert.deepEqual(calculateScheduledTotalsForMonth(transactions, '2026-08-01'), {
    income: 550,
    expenses: 600,
    net: -50,
  })
  assert.deepEqual(calculateScheduledTotalsForMonth(transactions, '2026-08-01', { recurringOnly: true }), {
    income: 300,
    expenses: 600,
    net: -300,
  })
  assert.equal(calculateTransactionAmountForMonth(transactions[2], '2026-09-01'), 0)
})

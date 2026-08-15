import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBalanceSheet, summarizeActuals, categoryGroup, groupReportTransactions, reportStats } from './reportingData.js'

test('builds actual P&L totals, monthly results, categories, and vendor spend', () => {
  const report = summarizeActuals([
    { date: '2026-01-04', amount: -1000, name: 'Client payment' },
    { date: '2026-01-05', amount: 300, name: 'Supply House', category: 'Materials' },
    { date: '2026-02-05', amount: 200, name: 'Supply House', category: 'Materials' },
  ], 2026)
  assert.equal(report.income, 1000)
  assert.equal(report.expenses, 500)
  assert.equal(report.net, 500)
  assert.deepEqual(report.vendorSpend[0], ['Supply House', 500])
  assert.equal(report.months[0].net, 700)
})

test('builds a cash-basis balance sheet from modeled accounts', () => {
  const report = buildBalanceSheet([
    { name: 'Checking', type: 'checking', balance: 5000 },
    { name: 'Card', type: 'credit', balance: -1200 },
  ])
  assert.equal(report.totalAssets, 5000)
  assert.equal(report.totalLiabilities, 1200)
  assert.equal(report.equity, 3800)
})

test('Monarch-style reports group and summarize transactions', () => {
  const rows = [
    { amount: 12, category: 'Groceries', name: 'Market' },
    { amount: 8, category: 'Restaurants', name: 'Cafe' },
    { amount: -100, category: 'Paycheck', name: 'Employer' },
  ]
  assert.equal(categoryGroup('Groceries'), 'Food & Dining')
  assert.deepEqual(groupReportTransactions(rows, 'expense', 'group').map(row => [row.name, row.amount]), [['Food & Dining', 20]])
  assert.deepEqual(reportStats(rows, 'expense'), { total: 20, count: 2, largest: 12, average: 10 })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBalanceSheet, summarizeActuals } from './reportingData.js'

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

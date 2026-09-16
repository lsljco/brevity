import test from 'node:test'
import assert from 'node:assert/strict'
import { actualTransactionKind, buildBalanceSheet, summarizeActuals, categoryGroup, groupCashInflows, groupReportTransactions, reportStats, matchesTransactionFilter, budgetCategoryForTransaction, summarizeActualCashActivity, summarizeBudgetActuals, isRealizedIncomeTransaction, isRecognizedIncomeTransaction, isTransferTransaction, transactionDirection } from './reportingData.js'

test('builds actual P&L totals, monthly results, categories, and vendor spend', () => {
  const report = summarizeActuals([
    { date: '2026-01-04', amount: -1000, name: 'Client payment', category:'INCOME' },
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

test('report filters carry category and direction into Transactions', () => {
  const income = { id: '1', amount: -100, category: 'TS TransAmerica Income', name: 'Robert Half' }
  const expense = { id: '2', amount: 20, category: 'Groceries', name: 'Market' }
  assert.equal(matchesTransactionFilter(income, { direction: 'income', displayBy: 'category', value: 'TS TransAmerica Income' }), true)
  assert.equal(matchesTransactionFilter(expense, { direction: 'income' }), false)
  assert.equal(matchesTransactionFilter({ amount: 45, category: 'FOOD_AND_DRINK' }, { budgetCategory: 'Food' }), true)
})

test('transaction search covers merchant, statement, category, and institution text', () => {
  const row = { name: 'Robert Half', originalStatement: 'PAYROLL DEPOSIT', category: 'TS TransAmerica Income', institution: 'Pinnacle' }
  assert.equal(matchesTransactionFilter(row, { query: 'robert' }), true)
  assert.equal(matchesTransactionFilter(row, { query: 'payroll' }), true)
  assert.equal(matchesTransactionFilter(row, { query: 'pinnacle' }), true)
  assert.equal(matchesTransactionFilter(row, { query: 'amazon' }), false)
})

test('realized income excludes transfers and merchant credits', () => {
  const payroll = { amount: -1200, category: 'INCOME', name: 'Employer payroll' }
  const pendingPayroll = { amount: -1200, category: 'INCOME', name: 'Employer payroll', pending: true }
  const refund = { amount: -24, category: 'ENTERTAINMENT', name: 'Apple' }
  const mislabeledMerchantCredit = { amount: -78.90, category: 'INCOME', name: 'Pending: Memo Credit POS - Instacart' }
  const transfer = { amount: -500, category: 'TRANSFER_IN', name: 'Transfer from savings' }
  assert.equal(isRealizedIncomeTransaction(payroll), true)
  assert.equal(isRealizedIncomeTransaction(pendingPayroll), false)
  assert.equal(isRealizedIncomeTransaction(refund), false)
  assert.equal(isRealizedIncomeTransaction(mislabeledMerchantCredit), false)
  assert.equal(isRealizedIncomeTransaction(transfer), false)
  assert.equal(isRecognizedIncomeTransaction(pendingPayroll), true)
  assert.equal(actualTransactionKind(payroll), 'income')
  assert.equal(actualTransactionKind(refund), 'other-inflow')
  assert.equal(actualTransactionKind(transfer), 'transfer')
  assert.equal(matchesTransactionFilter(payroll, { realizedIncomeOnly: true }), true)
  assert.equal(matchesTransactionFilter(pendingPayroll, { realizedIncomeOnly: true }), false)
  assert.equal(matchesTransactionFilter(refund, { realizedIncomeOnly: true }), false)
})

test('budget actuals normalize Plaid categories and exclude transfers', () => {
  assert.equal(budgetCategoryForTransaction({ amount: 90, category: 'RENT_AND_UTILITIES' }), 'Utilities')
  assert.equal(budgetCategoryForTransaction({ amount: 90, category: 'TRANSFER_OUT' }), null)
  assert.equal(budgetCategoryForTransaction({ amount: -24, category: 'GENERAL_MERCHANDISE', name: 'Purchase refund' }), null)
  assert.equal(budgetCategoryForTransaction({ amount: -500, category: 'INCOME', name: 'Employer payroll', pending:true }), null)
  assert.equal(budgetCategoryForTransaction({ amount: 90, category: 'RENT_AND_UTILITIES', pending:true }), null)
  assert.deepEqual(summarizeBudgetActuals([
    { amount: 90, category: 'RENT_AND_UTILITIES' },
    { amount: 10, category: 'ELECTRIC' },
    { amount: -500, category: 'INCOME' },
    { amount: -24, category: 'GENERAL_MERCHANDISE', name: 'Purchase refund' },
    { amount: -500, category: 'INCOME', name: 'Employer payroll', pending:true },
    { amount: 90, category: 'RENT_AND_UTILITIES', pending:true },
    { amount: 200, category: 'TRANSFER_OUT' },
  ]), { Utilities: 100, Income: 500 })
})

test('cash flow, spending, and income reports exclude account transfers and card payments', () => {
  const rows = [
    { date: '2026-08-01', amount: -1000, category: 'INCOME', name: 'Employer' },
    { date: '2026-08-02', amount: 200, category: 'FOOD_AND_DRINK', name: 'Market' },
    { date: '2026-08-03', amount: -500, category: 'TRANSFER_IN', name: 'Transfer from savings' },
    { date: '2026-08-04', amount: 500, category: 'TRANSFER_OUT', name: 'Transfer to savings' },
    { date: '2026-08-05', amount: 125, category: 'LOAN_PAYMENTS', name: 'Credit Card Payment' },
  ]
  const report = summarizeActuals(rows, 2026)
  assert.equal(report.income, 1000)
  assert.equal(report.expenses, 200)
  assert.equal(report.net, 800)
  assert.equal(reportStats(rows, 'expense').total, 200)
  assert.equal(reportStats(rows, 'income').total, 1000)
  assert.equal(transactionDirection(rows[2]), 'transfer')
  assert.equal(isTransferTransaction(rows[4]), true)
})

test('actual cash flow adds non-income credits as inflows instead of reversing their sign', () => {
  const totals = summarizeActualCashActivity([
    { amount:-1000, category:'INCOME', name:'Employer payroll' },
    { amount:-25, category:'GENERAL_MERCHANDISE', name:'Purchase refund' },
    { amount:-40, category:'INCOME', name:'Employer payroll', pending:true },
    { amount:300, category:'FOOD_AND_DRINK', name:'Market' },
    { amount:10, category:'FOOD_AND_DRINK', name:'Pending market', pending:true },
    { amount:500, category:'TRANSFER_OUT', name:'Transfer to savings' },
  ])

  assert.deepEqual(totals, {
    income:1000,
    otherInflows:25,
    pendingInflows:40,
    inflows:1065,
    expenses:310,
    pendingExpenses:10,
    net:755,
  })
})

test('revenue and income reports never count refunds, merchant credits, or pending deposits as earned income', () => {
  const rows = [
    { date:'2026-09-01', amount:-1000, category:'INCOME', name:'Employer payroll' },
    { date:'2026-09-02', amount:-50, category:'GENERAL_MERCHANDISE', name:'Purchase refund' },
    { date:'2026-09-03', amount:-25, category:'INCOME', name:'Merchant credit' },
    { date:'2026-09-04', amount:-500, category:'INCOME', name:'Employer payroll', pending:true },
    { date:'2026-09-05', amount:200, category:'FOOD_AND_DRINK', name:'Market' },
  ]
  const report = summarizeActuals(rows, 2026)
  assert.equal(report.income, 1000)
  assert.equal(report.expenses, 200)
  assert.equal(report.net, 800)
  assert.equal(reportStats(rows, 'income').total, 1000)
  assert.deepEqual(groupReportTransactions(rows, 'income', 'category').map(row => row.name), ['INCOME'])
  assert.equal(groupCashInflows(rows, 'category').reduce((sum, row) => sum + row.amount, 0), 1075)
})

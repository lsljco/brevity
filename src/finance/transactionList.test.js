import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TRANSACTION_LIST_OPTIONS, sortAndFilterTransactions, transactionDescription } from './transactionList.js'

const transactions = [
  { id: 'amazon', name: 'Amazon', amount: 35, date: '2026-08-31' },
  { id: 'discover', name: 'Discover payment', amount: 1064, date: '2026-08-30' },
  { id: 'payroll', name: 'Payroll', amount: -4506, date: '2026-09-01' },
  { id: 'groceries', description: 'Grocery store', amount: 132, start: '2026-08-29' },
]

test('transaction lists default to greatest absolute amount first', () => {
  assert.deepEqual(sortAndFilterTransactions(transactions).map(item => item.id), ['payroll', 'discover', 'groceries', 'amazon'])
  assert.equal(DEFAULT_TRANSACTION_LIST_OPTIONS.sortBy, 'amount')
  assert.equal(DEFAULT_TRANSACTION_LIST_OPTIONS.sortDirection, 'desc')
})

test('transactions sort by description or date in either direction', () => {
  assert.deepEqual(sortAndFilterTransactions(transactions, { sortBy: 'description', sortDirection: 'asc' }).map(item => item.id), ['amazon', 'discover', 'groceries', 'payroll'])
  assert.deepEqual(sortAndFilterTransactions(transactions, { sortBy: 'date', sortDirection: 'desc' }).map(item => item.id), ['payroll', 'amazon', 'discover', 'groceries'])
})

test('description, amount, and date filters compose', () => {
  assert.deepEqual(sortAndFilterTransactions(transactions, { description: 'pay' }).map(item => item.id), ['payroll', 'discover'])
  assert.deepEqual(sortAndFilterTransactions(transactions, { minAmount: 100, maxAmount: 1100 }).map(item => item.id), ['discover', 'groceries'])
  assert.deepEqual(sortAndFilterTransactions(transactions, { dateFrom: '2026-08-30', dateTo: '2026-08-31' }).map(item => item.id), ['discover', 'amazon'])
})

test('full bank statement descriptions remain searchable and take display priority', () => {
  const bankTransaction = {
    name: 'Amazon',
    originalStatement: 'AMZN Mktp US*2A4H19 Seattle WA Card 607',
    amount: 59.21,
    date: '2026-08-31',
  }
  assert.equal(transactionDescription(bankTransaction), 'AMZN Mktp US*2A4H19 Seattle WA Card 607')
  assert.deepEqual(sortAndFilterTransactions([bankTransaction], { description: 'card 607' }), [bankTransaction])
})

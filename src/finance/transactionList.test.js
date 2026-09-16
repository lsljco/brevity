import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScheduledTransactionRows, DEFAULT_TRANSACTION_LIST_OPTIONS, sortAndFilterTransactions, transactionDescription, transactionVisibleName } from './transactionList.js'

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

test('scheduled series sort and filter by their displayed timeframe total', () => {
  const scheduled = [
    { id: 'weekly', name: 'Weekly income', amount: 800, rangeAmount: 3200, start: '2026-09-04' },
    { id: 'monthly', name: 'Monthly income', amount: 2500, rangeAmount: 2500, start: '2026-09-15' },
  ]

  assert.deepEqual(sortAndFilterTransactions(scheduled).map(item => item.id), ['weekly', 'monthly'])
  assert.deepEqual(sortAndFilterTransactions(scheduled, { minAmount: 3000 }).map(item => item.id), ['weekly'])
  assert.deepEqual(sortAndFilterTransactions(scheduled, { maxAmount: 2600 }).map(item => item.id), ['monthly'])
})

test('scheduled date filters use in-range occurrences and recompute the displayed total', () => {
  const weekly = {
    id:'weekly', name:'Weekly income', amount:800, rangeAmount:3200, occurrenceCount:4,
    rangeOccurrences:[
      { date:'2026-09-04', amount:800 },
      { date:'2026-09-11', amount:800 },
      { date:'2026-09-18', amount:800 },
      { date:'2026-09-25', amount:800 },
    ],
  }

  const [filtered] = sortAndFilterTransactions([weekly], { dateFrom:'2026-09-10', dateTo:'2026-09-18' })
  assert.equal(filtered.rangeAmount, 1600)
  assert.equal(filtered.occurrenceCount, 2)
  assert.deepEqual(filtered.rangeOccurrences.map(occurrence => occurrence.date), ['2026-09-11','2026-09-18'])
  assert.deepEqual(sortAndFilterTransactions([weekly], { dateFrom:'2026-10-01' }), [])
})

test('projected transaction rows derive totals from the selected account scope and finance timeframe', () => {
  const operatingOnly = [
    { id:'operating-weekly', acct:'a1', name:'Operating income', amount:100, type:'income', freq:'weekly', start:'2026-09-04' },
  ]
  const rows = buildScheduledTransactionRows(
    operatingOnly,
    { from:'2026-09-07', to:'2026-09-20' },
    null,
    { sortBy:'amount', sortDirection:'desc' },
  )

  assert.deepEqual(rows.map(row => [row.id, row.rangeAmount, row.occurrenceCount]), [
    ['operating-weekly', 200, 2],
  ])
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

test('edited visible names drive description sorting while both edited and original text remain searchable', () => {
  const renamed = {
    id:'renamed',
    name:'Household Supplies',
    originalStatement:'AMZN Mktp US*2A4H19 Seattle WA Card 607',
    amount:42,
  }
  const other = { id:'other', name:'Auto Insurance', originalStatement:'TRAVELERS', amount:80 }

  assert.equal(transactionVisibleName(renamed), 'Household Supplies')
  assert.deepEqual(sortAndFilterTransactions([renamed, other], { description:'household' }).map(item => item.id), ['renamed'])
  assert.deepEqual(sortAndFilterTransactions([renamed, other], { description:'seattle' }).map(item => item.id), ['renamed'])
  assert.deepEqual(sortAndFilterTransactions([renamed, other], { sortBy:'description', sortDirection:'asc' }).map(item => item.id), ['other','renamed'])
})

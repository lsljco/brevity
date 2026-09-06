import test from 'node:test'
import assert from 'node:assert/strict'
import { findPossibleRecurringDuplicates, summarizeActualActivity } from './financialTruth.js'

test('duplicate detection requires merchant evidence as well as a similar amount', () => {
  const rows = [
    { id:'cable', name:'Cable Internet', type:'expense', freq:'monthly', amount:336, acct:'checking' },
    { id:'care', name:'Care Credit', type:'expense', freq:'monthly', amount:337, acct:'checking' },
    { id:'att-1', name:'AT&T Mobility', type:'expense', freq:'monthly', amount:450, acct:'checking' },
    { id:'att-2', merchant_name:'AT&T Mobility LLC', type:'expense', freq:'monthly', amount:451, acct:'checking' },
  ]
  const pairs = findPossibleRecurringDuplicates(rows)
  assert.equal(pairs.length, 1)
  assert.deepEqual([pairs[0].left.id, pairs[0].right.id], ['att-1', 'att-2'])
  assert.equal(pairs[0].confidence, 'high')
})

test('actual activity excludes transfers and card payments from spending', () => {
  const summary = summarizeActualActivity([
    { id:'purchase', name:'Groceries', amount:100, category:'FOOD_AND_DRINK' },
    { id:'income', name:'Paycheck', amount:-500, category:'INCOME' },
    { id:'transfer', name:'Transfer to savings', amount:300, category:'TRANSFER_OUT' },
    { id:'card', name:'Payment to Visa', amount:200, category:'LOAN_PAYMENTS' },
  ])
  assert.equal(summary.spent, 100)
  assert.equal(summary.received, 500)
  assert.equal(summary.net, 400)
  assert.equal(summary.largestExpense.id, 'purchase')
})

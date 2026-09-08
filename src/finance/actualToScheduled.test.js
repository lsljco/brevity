import test from 'node:test'
import assert from 'node:assert/strict'
import { actualToScheduledTransaction } from './actualToScheduled.js'

test('make recurring carries an actual transaction into the scheduled form', () => {
  assert.deepEqual(actualToScheduledTransaction({ name: 'Employer', amount: -1250, date: '2026-08-21', category: 'Income' }, 'operating', 'new-1'), {
    id: 'new-1', name: 'Employer', amount: '1250', type: 'income', cat: 'Income', acct: 'operating',
    start: '2026-08-21', end: '', freq: 'monthly', dayOfWeek: '', dayOfMonth: '', skipDates: [], notes: '',
  })
})

test('refunds and account transfers cannot be mislabeled as recurring income or expense', () => {
  assert.throws(() => actualToScheduledTransaction({ name:'Merchant refund', amount:-50, category:'GENERAL_MERCHANDISE' }, 'operating'), /cannot become expected-income plans/)
  assert.throws(() => actualToScheduledTransaction({ name:'Transfer to savings', amount:500, category:'TRANSFER_OUT' }, 'operating'), /cannot become income or expense plans/)
})

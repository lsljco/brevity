import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileFinanceDay } from './reconciliation.js'
import { editRecurringOccurrence } from './recurrenceEditing.js'
import { txOccursOnDate } from './projection.js'
import { calculateScheduledTotalsForRange } from './monthlyCashFlow.js'

const plan = { id:'sawnee', name:'Sawnee EMC - Electric', amount:1204, type:'expense', cat:'Utilities', acct:'operating', freq:'monthly', start:'2026-08-02' }
const bank = { id:'posted-sawnee', name:'SAWNEE EMC BANK DRAFT 2580246393 R', amount:1204, accountId:'bank-operating', date:'2026-09-30', pending:false }
const options = { date:bank.date, actuals:[bank], matchWindowDays:0, exactAmounts:true, accountMap:{ 'bank-operating':'operating', 'bank-other':'other' } }
const move = () => editRecurringOccurrence(plan, plan, '2026-10-02', 'one', () => 'sawnee-moved', '2026-09-30').upserts

test('Sawnee clears only after moving October 2 to September 30 and remains matched after reload', () => {
  assert.equal(reconcileFinanceDay({ ...options, scheduled:[plan] }).rows[0].state, 'unplanned-actual')
  const saved = JSON.parse(JSON.stringify(move()))
  const result = reconcileFinanceDay({ ...options, scheduled:saved })
  assert.equal(result.matched, 1)
  assert.equal(result.needsReview.length, 0)
  assert.equal(result.rows[0].amountVariance, 0)
  assert.equal(result.rows[0].actual.id, bank.id)
  assert.equal(saved.filter(tx => txOccursOnDate(tx, new Date('2026-10-02T12:00:00'))).length, 0)
  assert.equal(saved.filter(tx => txOccursOnDate(tx, new Date('2026-11-02T12:00:00'))).length, 1)
  assert.equal(saved.filter(tx => txOccursOnDate(tx, new Date('2026-09-02T12:00:00'))).length, 1)
  assert.equal(calculateScheduledTotalsForRange(saved, { from:'2026-10-01', to:'2026-10-31' }).expenses, 0)
  assert.equal(bank.date, '2026-09-30')
  assert.equal(bank.amount, 1204)
})

test('pending, penny differences, other accounts, and unknown account links never clear', () => {
  for (const changed of [{ pending:true }, { amount:1204.01 }, { accountId:'bank-other' }, { accountId:'unknown' }]) {
    const result = reconcileFinanceDay({ ...options, scheduled:move(), actuals:[{ ...bank, ...changed }] })
    assert.equal(result.matched, 0, JSON.stringify(changed))
    assert.ok(result.needsReview.length)
  }
})

test('equal candidate charges and plans stay ambiguous; a bank charge cannot clear two bills', () => {
  const scheduled = move()
  const duplicateActual = reconcileFinanceDay({ ...options, scheduled, actuals:[bank, { ...bank, id:'another-charge' }] })
  assert.equal(duplicateActual.matched, 0)
  assert.equal(duplicateActual.counts.ambiguous, 1)
  const duplicatePlan = reconcileFinanceDay({ ...options, scheduled:[...scheduled, { ...scheduled[1], id:'another-plan' }] })
  assert.equal(duplicatePlan.matched, 0)
  assert.equal(duplicatePlan.counts.ambiguous, 1)
})

test('moving the isolated occurrence back restores the forecast and unmatched bank item', () => {
  const saved = move()
  const undone = editRecurringOccurrence(saved[1], saved[1], '2026-09-30', 'one', () => 'unused', '2026-10-02').upserts
  const restored = [saved[0], ...undone]
  assert.equal(reconcileFinanceDay({ ...options, scheduled:restored }).rows[0].state, 'unplanned-actual')
  assert.equal(restored.filter(tx => txOccursOnDate(tx, new Date('2026-10-02T12:00:00'))).length, 1)
})

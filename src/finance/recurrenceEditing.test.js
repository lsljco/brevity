import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteRecurringOccurrence, editRecurringOccurrence } from './recurrenceEditing.js'

const weekly = { id: 'income', name: 'Income', amount: 100, type: 'income', freq: 'weekly', start: '2026-08-07', end: '', skips: [] }

test('editing one occurrence skips the original date and creates one isolated item', () => {
  const result = editRecurringOccurrence(weekly, { ...weekly, amount: 125 }, '2026-08-21', 'one', () => 'isolated')
  assert.deepEqual(result.deleteIds, [])
  assert.deepEqual(result.upserts[0].skips, ['2026-08-21'])
  assert.equal(result.upserts[1].id, 'isolated')
  assert.equal(result.upserts[1].freq, 'once')
  assert.equal(result.upserts[1].start, '2026-08-21')
  assert.equal(result.upserts[1].amount, 125)
})

test('editing all future occurrences preserves history and starts a new series', () => {
  const result = editRecurringOccurrence(weekly, { ...weekly, amount: 150 }, '2026-08-21', 'future', () => 'future')
  assert.equal(result.upserts[0].end, '2026-08-20')
  assert.equal(result.upserts[1].id, 'future')
  assert.equal(result.upserts[1].start, '2026-08-21')
  assert.equal(result.upserts[1].amount, 150)
})

test('reviewed moves preserve the original occurrence history and use the explicit destination', () => {
  const one = editRecurringOccurrence(weekly, { ...weekly }, '2026-08-21', 'one', () => 'moved-one', '2026-08-22')
  assert.deepEqual(one.upserts[0].skips, ['2026-08-21'])
  assert.equal(one.upserts[1].start, '2026-08-22')
  assert.equal(one.upserts[1].end, '2026-08-22')

  const future = editRecurringOccurrence(weekly, { ...weekly }, '2026-08-21', 'future', () => 'moved-future', '2026-08-22')
  assert.equal(future.upserts[0].end, '2026-08-20')
  assert.equal(future.upserts[1].start, '2026-08-22')
  assert.throws(
    () => editRecurringOccurrence(weekly, { ...weekly }, '2026-08-21', 'future', () => 'invalid', '2026-08-20'),
    /cannot begin before/,
  )
})

test('changing recurrence shape preserves an explicit reviewed end and never invents an open-ended series', () => {
  const oneTime = { ...weekly, id:'one-time', freq:'once', start:'2026-08-21', end:'2026-08-21' }
  const converted = editRecurringOccurrence(oneTime, { freq:'monthly' }, '2026-08-21', 'one', () => 'unused', '2026-09-21')
  assert.equal(converted.upserts[0].freq, 'monthly')
  assert.equal(converted.upserts[0].start, '2026-09-21')
  assert.equal(converted.upserts[0].end, '')

  const ending = editRecurringOccurrence(weekly, { freq:'once' }, '2026-08-21', 'future', () => 'last-item')
  assert.equal(ending.upserts[1].freq, 'once')
  assert.equal(ending.upserts[1].start, '2026-08-21')
  assert.equal(ending.upserts[1].end, '2026-08-21')

  assert.throws(
    () => editRecurringOccurrence({ ...weekly, end:'2026-08-28' }, {}, '2026-08-21', 'future', () => 'invalid-end', '2026-09-04'),
    /end date cannot be before/,
  )
})

test('deleting one occurrence does not cancel the series', () => {
  const result = deleteRecurringOccurrence(weekly, '2026-08-21', 'one')
  assert.deepEqual(result.deleteIds, [])
  assert.deepEqual(result.upserts[0].skips, ['2026-08-21'])
})

test('deleting all future occurrences ends the series the day before', () => {
  const result = deleteRecurringOccurrence(weekly, '2026-08-21', 'future')
  assert.deepEqual(result.deleteIds, [])
  assert.equal(result.upserts[0].end, '2026-08-20')
})

test('editing or deleting a date outside the current series fails closed', () => {
  assert.throws(
    () => editRecurringOccurrence(weekly, { amount:125 }, '2026-08-22', 'one', () => 'invalid'),
    /no longer part of this recurring series/,
  )
  assert.throws(
    () => deleteRecurringOccurrence({ ...weekly, skips:['2026-08-21'] }, '2026-08-21', 'one'),
    /no longer part of this recurring series/,
  )
})

test('an already skipped first occurrence cannot be edited as an item but remains a valid series anchor', () => {
  const skipped={...weekly,skips:[weekly.start]}
  assert.throws(
    () => editRecurringOccurrence(skipped, { amount:525 }, weekly.start, 'one', ()=>'isolated'),
    /no longer part of this recurring series/,
  )
  assert.throws(
    () => deleteRecurringOccurrence(skipped, weekly.start, 'one'),
    /no longer part of this recurring series/,
  )

  const future=editRecurringOccurrence(skipped, { amount:525 }, weekly.start, 'future', ()=>'future-series')
  assert.deepEqual(future.deleteIds, [weekly.id])
  assert.equal(future.upserts[0].id, 'future-series')
})

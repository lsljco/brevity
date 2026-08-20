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

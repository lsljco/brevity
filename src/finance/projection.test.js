import test from 'node:test'
import assert from 'node:assert/strict'
import { parseISODate, today0, toISO, txOccursOnDate } from './projection.js'
import { getHouseholdDateKey } from './financeTime.js'

const weekly = {
  id: 'weekly-friday',
  freq: 'weekly',
  start: '2026-07-03',
  end: '2026-08-14',
}

test('keeps a weekly Friday series on Fridays', () => {
  assert.equal(txOccursOnDate(weekly, new Date(2026, 7, 13)), false)
  assert.equal(txOccursOnDate(weekly, new Date(2026, 7, 14)), true)
})

test('treats the recurrence end date as inclusive and stops afterward', () => {
  assert.equal(txOccursOnDate(weekly, new Date(2026, 7, 14)), true)
  assert.equal(txOccursOnDate(weekly, new Date(2026, 7, 21)), false)
})

test('rejects invalid ISO calendar dates', () => {
  assert.equal(parseISODate('2026-02-29'), null)
  assert.equal(parseISODate('2026-08-14')?.getDate(), 14)
})

test('projection today follows the authoritative household calendar date', () => {
  assert.equal(toISO(today0()), getHouseholdDateKey())
})

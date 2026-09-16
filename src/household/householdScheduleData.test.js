import assert from 'node:assert/strict'
import test from 'node:test'
import { householdScheduleDate } from './householdScheduleData.js'

test('household schedule defaults follow the authoritative household date', () => {
  assert.equal(householdScheduleDate(new Date('2026-09-07T02:30:00.000Z')), '2026-09-06')
  assert.equal(householdScheduleDate(new Date('2026-09-07T04:30:00.000Z')), '2026-09-07')
})

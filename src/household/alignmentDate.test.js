import assert from 'node:assert/strict'
import test from 'node:test'
import { nextDailyPlanDate } from './alignmentDate.js'

test('next-day alignment advances to the following calendar day', () => {
  assert.equal(nextDailyPlanDate('2026-08-30'), '2026-08-31')
  assert.equal(nextDailyPlanDate('2026-08-31'), '2026-09-01')
})

test('next-day alignment crosses year and leap-day boundaries', () => {
  assert.equal(nextDailyPlanDate('2026-12-31'), '2027-01-01')
  assert.equal(nextDailyPlanDate('2028-02-28'), '2028-02-29')
})

test('next-day alignment rejects invalid daily plan dates', () => {
  assert.throws(() => nextDailyPlanDate('2026-02-30'), /Invalid daily plan date/)
  assert.throws(() => nextDailyPlanDate('tomorrow'), /Invalid daily plan date/)
})

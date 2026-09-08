import assert from 'node:assert/strict'
import test from 'node:test'
import { getHouseholdCalendarDate, getHouseholdDateKey, getHouseholdDateLabel, getHouseholdGreeting, getHouseholdMinuteOfDay, getHouseholdTimeLabel, HOUSEHOLD_TIME_ZONE } from './financeTime.js'

test('finance greeting follows the authoritative household time zone', () => {
  assert.equal(HOUSEHOLD_TIME_ZONE, 'America/New_York')
  assert.equal(getHouseholdGreeting(new Date('2026-09-07T14:00:00.000Z')), 'Good morning')
  assert.equal(getHouseholdGreeting(new Date('2026-09-07T17:24:00.000Z')), 'Good afternoon')
  assert.equal(getHouseholdGreeting(new Date('2026-09-07T22:00:00.000Z')), 'Good evening')
})

test('finance greeting can be evaluated in an explicitly supplied household zone', () => {
  const instant = new Date('2026-09-07T01:30:00.000Z')
  assert.equal(getHouseholdGreeting(instant, 'America/New_York'), 'Good evening')
  assert.equal(getHouseholdGreeting(instant, 'Pacific/Kiritimati'), 'Good afternoon')
})

test('finance calendar anchors follow the household date across a UTC boundary', () => {
  const instant = new Date('2026-09-07T02:30:00.000Z')
  const householdDate = getHouseholdCalendarDate(instant)

  assert.equal(getHouseholdDateKey(instant), '2026-09-06')
  assert.deepEqual(
    [householdDate.getFullYear(), householdDate.getMonth(), householdDate.getDate()],
    [2026, 8, 6],
  )
  assert.equal(getHouseholdDateLabel(instant), 'Sunday, September 6, 2026')
  assert.equal(getHouseholdTimeLabel(instant), '10:30 PM')
  assert.equal(getHouseholdMinuteOfDay(instant), 22 * 60 + 30)
})

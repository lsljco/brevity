import assert from 'node:assert/strict'
import test from 'node:test'
import { currentDailyPlanDate, dailyPlanFromRefresh } from './useDailyPlan.js'

test('the default daily plan date follows the authoritative household zone', () => {
  assert.equal(currentDailyPlanDate(new Date('2026-09-07T02:30:00.000Z')), '2026-09-06')
  assert.equal(currentDailyPlanDate(new Date('2026-09-07T04:30:00.000Z')), '2026-09-07')
})

test('application refresh adopts only the matching authoritative daily plan', () => {
  const plan = { id:'daily-plan-2026-09-07', date:'2026-09-07', theme:'Refreshed truth' }
  assert.equal(dailyPlanFromRefresh({ date:'2026-09-07', plan }, '2026-09-07').theme, 'Refreshed truth')
  assert.equal(dailyPlanFromRefresh({ date:'2026-09-06', plan }, '2026-09-07'), null)
  assert.equal(dailyPlanFromRefresh({ date:'2026-09-07', plan:{ ...plan, date:'2026-09-06' } }, '2026-09-07'), null)
})

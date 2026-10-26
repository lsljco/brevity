import assert from 'node:assert/strict'
import test from 'node:test'
import { actionAffectsDailyPlan, currentDailyPlanDate, dailyPlanFromRefresh } from './useDailyPlan.js'

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

test('reviewed sermon activation and undo refresh every open daily plan', () => {
  const detail={audit:{affectedRecords:[{resource:'sermon:active',beforeVersion:2,afterVersion:3}],operations:[]}}
  assert.equal(actionAffectsDailyPlan(detail,'2026-10-25'),true)
  assert.equal(actionAffectsDailyPlan(detail,'2026-10-26'),true)
  assert.equal(actionAffectsDailyPlan({audit:{affectedRecords:[{resource:'finance:budget'}]}},'2026-10-26'),false)
})

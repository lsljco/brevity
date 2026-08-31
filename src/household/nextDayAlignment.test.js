import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const householdTodaySource = readFileSync(new URL('./HouseholdToday.jsx', import.meta.url), 'utf8')
const dashboardSource = readFileSync(new URL('./TodayDashboard.jsx', import.meta.url), 'utf8')
const alignmentSource = readFileSync(new URL('./MorningAlignment.jsx', import.meta.url), 'utf8')

test('alignment loads and saves the next daily plan instead of today', () => {
  assert.match(householdTodaySource, /useDailyPlan\(alignmentDate\)/)
  assert.match(householdTodaySource, /plan=\{alignmentPlanWithMeals\}/)
  assert.match(householdTodaySource, /onSaveDraft=\{saveAlignmentPlan\}/)
  assert.match(householdTodaySource, /persistAndSync\(nextPlan, saveAlignmentPlan\)/)
})

test('the dashboard and alignment screen identify tomorrow as the target', () => {
  assert.match(dashboardSource, /Start Tomorrow’s Alignment/)
  assert.match(dashboardSource, /Review Tomorrow’s Alignment/)
  assert.match(alignmentSource, /Next-Day Alignment/)
  assert.match(alignmentSource, /formatDailyPlanDate\(draft\.date\)/)
})

test('today alignment is a separate action that saves only today’s plan', () => {
  assert.match(dashboardSource, /Start Today’s Alignment/)
  assert.match(dashboardSource, /Adjust Today’s Alignment/)
  assert.match(householdTodaySource, /mode === 'today-alignment'/)
  assert.match(householdTodaySource, /timing="today" plan=\{planWithMeals\}/)
  assert.match(householdTodaySource, /onSaveDraft=\{savePlan\}/)
  assert.match(householdTodaySource, /onComplete=\{completeTodayAlignment\}/)
  assert.match(alignmentSource, /Today’s Alignment/)
  assert.match(alignmentSource, /These updates apply only to today/)
})

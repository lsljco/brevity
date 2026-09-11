import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const householdTodaySource = readFileSync(new URL('./HouseholdToday.jsx', import.meta.url), 'utf8')
const dashboardSource = readFileSync(new URL('./TodayDashboard.jsx', import.meta.url), 'utf8')
const alignmentSource = readFileSync(new URL('./MorningAlignment.jsx', import.meta.url), 'utf8')

test('alignment loads the next daily plan and stages its exact reviewed version', () => {
  assert.match(householdTodaySource, /useDailyPlan\(alignmentDate\)/)
  assert.match(householdTodaySource, /plan=\{alignmentPlanWithMeals\}/)
  assert.match(householdTodaySource, /buildAlignmentOperations\(original, nextPlan, \{ completedAt \}\)/)
  assert.match(householdTodaySource, /expectedVersion \}/)
  assert.doesNotMatch(householdTodaySource, /onSaveDraft|saveAlignmentPlan|persistAndSync/)
})

test('the dashboard and alignment screen identify tomorrow as the target', () => {
  assert.match(dashboardSource, /Start Tomorrow’s Alignment/)
  assert.match(dashboardSource, /Review Tomorrow’s Alignment/)
  assert.match(alignmentSource, /Next-Day Alignment/)
  assert.match(alignmentSource, /formatDailyPlanDate\(draft\.date\)/)
})

test('alignment flushes the latest local draft when the screen unmounts or the page is hidden', () => {
  assert.match(alignmentSource, /latestDraftRef/)
  assert.match(alignmentSource, /addEventListener\?\.\('pagehide', persistLatest\)/)
  assert.match(alignmentSource, /removeEventListener\?\.\('pagehide', persistLatest\)/)
  assert.match(alignmentSource, /saveLocalAlignmentDraft\(globalThis\.localStorage, latestDraftRef\.current, openedVersionRef\.current\)/)
})

test('today alignment is a separate reviewed action scoped only to today', () => {
  assert.match(dashboardSource, /Start Today’s Alignment/)
  assert.match(dashboardSource, /Adjust Today’s Alignment/)
  assert.match(householdTodaySource, /mode === 'today-alignment'/)
  assert.match(householdTodaySource, /timing="today" plan=\{planWithMeals\}/)
  assert.match(householdTodaySource, /onComplete=\{completeTodayAlignment\}/)
  assert.match(householdTodaySource, /stageDailyPlanReview/)
  assert.doesNotMatch(householdTodaySource, /savePlan\(/)
  assert.match(alignmentSource, /Today’s Alignment/)
  assert.match(alignmentSource, /These updates apply only to today/)
})

test('Today displays the resolved rolling breakfast, lunch and dinner with their images', () => {
  assert.match(householdTodaySource, /resolvedMeals \|\| \{\}/)
  assert.match(householdTodaySource, /meals=\{todayMeals\}/)
  assert.match(dashboardSource, /Today’s Meals/)
  assert.match(dashboardSource, /Object\.entries\(MEAL_LABELS\)/)
  assert.match(dashboardSource, /<img src=\{meal\.image\} alt=\{`\$\{label\}: \$\{meal\.name\}`\}/)
})

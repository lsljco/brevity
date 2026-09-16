import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const planner = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')
const actionsFunction = readFileSync(new URL('../../netlify/functions/brevity-assistant-actions.mjs', import.meta.url), 'utf8')

test('budget targets require reviewed Action Mode changes', () => {
  assert.match(planner, /type:\s*'budget\.update'/)
  assert.match(planner, /getAcknowledgedSharedStateVersion\(localStorage, storageKey\)/)
  assert.match(planner, /requestActionReview\(result\.proposal\)/)
  assert.match(planner, /onReviewBudgetChange=\{reviewBudgetChange\}/)
  assert.match(planner, /window\.addEventListener\(SHARED_STATE_EVENT, refreshBudget\)/)
  assert.match(actionsFunction, /DIRECT_REVIEW_TYPES[^\n]*'budget\.update'/)
  assert.doesNotMatch(planner, /function saveBudget\(/)
  assert.doesNotMatch(planner, /localStorage\.setItem\(BUDGET_LS_KEY/)
})

test('budget actuals remain bank-derived and cannot be manually overwritten', () => {
  assert.match(planner, /Actuals are calculated from posted bank activity and cannot be overwritten manually/)
  assert.match(planner, /Calculated from posted bank activity; pending transactions are excluded/)
  assert.doesNotMatch(planner, /ACTUALS_LS_KEY/)
  assert.doesNotMatch(planner, /setActual\(/)
  assert.doesNotMatch(planner, /Click any Actual amount to enter spending/)
})

test('annual totals use the same reviewed-or-recurring monthly values as the budget cards', () => {
  assert.match(planner, /unreviewed months follow the recurring plan/)
  assert.match(planner, /annual totals are calculated from all monthly budget values/)
  assert.match(planner, /getBudgeted\(line, month, selYear\)/)
  assert.doesNotMatch(planner, /Array\(12\)\.fill\(v\)/)
})

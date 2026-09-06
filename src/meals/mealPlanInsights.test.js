import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeMealPlan } from './mealPlanInsights.js'

test('summarizes planned meal workload without claiming actual adherence', () => {
  const meal = (name, prepMinutes, proteinGrams) => ({ name, prepMinutes, macros:{ proteinGrams } })
  const result = summarizeMealPlan([{ date:'2026-09-06', resolvedMeals:{ breakfast:meal('Eggs',10,20), dinner:meal('Chicken',30,40) } },{ date:'2026-09-07', resolvedMeals:{ dinner:meal('Salmon',25,35) } }])
  assert.equal(result.mealCount, 3)
  assert.equal(result.totalPrepMinutes, 65)
  assert.equal(result.averageProteinGrams, 32)
  assert.equal(result.longestPrep.name, 'Chicken')
  assert.equal(result.tomorrowDinner.name, 'Salmon')
})

test('returns no insight when there is no resolved plan', () => assert.equal(summarizeMealPlan([]), null))

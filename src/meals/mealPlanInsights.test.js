import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeMealPlan } from './mealPlanInsights.js'

test('summarizes total planned prep and macros without claiming actual adherence', () => {
  const meal = (name, prepMinutes, calories, proteinGrams, carbohydrateGrams, fatGrams) => ({
    name,
    prepMinutes,
    macros:{ calories, proteinGrams, carbohydrateGrams, fatGrams },
  })
  const result = summarizeMealPlan([
    { date:'2026-09-06', resolvedMeals:{ breakfast:meal('Eggs',10,300,20,12,18), dinner:meal('Chicken',30,500,40,32,20) } },
    { date:'2026-09-07', resolvedMeals:{ dinner:meal('Salmon',25,400,35,20,22) } },
  ])
  assert.equal(result.mealCount, 3)
  assert.equal(result.totalPrepMinutes, 65)
  assert.equal(result.totalCalories, 1200)
  assert.equal(result.totalProteinGrams, 95)
  assert.equal(result.totalCarbohydrateGrams, 64)
  assert.equal(result.totalFatGrams, 60)
  assert.equal(result.averageProteinGrams, 32)
  assert.equal(result.longestPrep.name, 'Chicken')
  assert.equal(result.tomorrowDinner.name, 'Salmon')
})

test('treats missing or invalid numeric meal values as zero', () => {
  const result = summarizeMealPlan([{ resolvedMeals:{ breakfast:{ name:'Custom meal', prepMinutes:'15', macros:{ calories:'450', proteinGrams:'bad', carbohydrateGrams:30, fatGrams:12 } } } }])
  assert.equal(result.totalPrepMinutes, 15)
  assert.equal(result.totalCalories, 450)
  assert.equal(result.totalProteinGrams, 0)
  assert.equal(result.totalCarbohydrateGrams, 30)
  assert.equal(result.totalFatGrams, 12)
})

test('returns no insight when there is no resolved plan', () => assert.equal(summarizeMealPlan([]), null))

import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeMealPlan } from './mealPlanInsights.js'

test('summarizes the complete selected day instead of incorrectly totaling the seven-day window', () => {
  const meal = (name, prepMinutes, calories, proteinGrams, carbohydrateGrams, fatGrams) => ({
    name,
    prepMinutes,
    macros:{ calories, proteinGrams, carbohydrateGrams, fatGrams },
  })
  const result = summarizeMealPlan([
    { date:'2026-09-06', resolvedMeals:{ breakfast:meal('Eggs',10,300,20,12,18), dinner:meal('Chicken',30,500,40,32,20) } },
    { date:'2026-09-07', resolvedMeals:{ dinner:meal('Salmon',25,400,35,20,22) } },
  ])
  assert.equal(result.selectedDate, '2026-09-06')
  assert.equal(result.mealCount, 2)
  assert.equal(result.totalPrepMinutes, 40)
  assert.equal(result.totalCalories, 800)
  assert.equal(result.totalProteinGrams, 60)
  assert.equal(result.totalCarbohydrateGrams, 44)
  assert.equal(result.totalFatGrams, 38)
  assert.equal(result.averageProteinGrams, 30)
  assert.equal(result.longestPrep.name, 'Chicken')
  assert.equal(result.tomorrowDinner.name, 'Salmon')
})

test('uses explicit total preparation time when prep and cook time are stored separately', () => {
  const result=summarizeMealPlan([{date:'2026-09-06',resolvedMeals:{dinner:{name:'Steak',prepMinutes:20,cookMinutes:30,totalMinutes:50,macros:{calories:700,proteinGrams:55,carbohydrateGrams:40,fatGrams:35}}}}])
  assert.equal(result.totalPrepMinutes,50)
  assert.equal(result.longestPrep.prepMinutes,50)
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

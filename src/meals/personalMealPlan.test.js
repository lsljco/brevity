import test from 'node:test'
import assert from 'node:assert/strict'
import { personalMealPlan, mealTotals, scaledIngredient, portionIngredients } from './personalMealPlan.js'
import { resolveMealDay } from './mealPlanData.js'
import { applyRecordOperation } from '../../netlify/lib/assistant-action-executor.mjs'
const plate={id:'plate',serving:'1 plate',macros:{calories:400,proteinGrams:40,carbohydrateGrams:30,fatGrams:12}}
const meals={breakfast:plate,lunch:plate,dinner:plate,snack1:{macros:{calories:160,proteinGrams:30,carbohydrateGrams:4,fatGrams:3}},snack2:{macros:{calories:95,proteinGrams:.5,carbohydrateGrams:25,fatGrams:.3}}}
test('member targets derive different portions and all four macros without changing source recipes',()=>{
  const source=structuredClone(meals)
  const larry=personalMealPlan(meals,{proteinGrams:160}),terica=personalMealPlan(meals,{proteinGrams:130})
  assert.equal(larry.factor,1.07)
  assert.equal(terica.factor,.82)
  assert.ok(larry.totals.proteinGrams>158&&larry.totals.proteinGrams<=160)
  assert.equal(larry.meals.snack1.macros.proteinGrams,30)
  assert.equal(larry.meals.lunch.macros.calories,428)
  assert.deepEqual(meals,source)
})
test('calorie caps and unknown nutrition are visible rather than fabricated',()=>{
  assert.equal(personalMealPlan(meals,{}).factor,1)
  const result=personalMealPlan(meals,{proteinGrams:160,calories:1455})
  assert.equal(result.factor,1)
  assert.equal(result.totals.proteinGrams,150.5)
  assert.equal(personalMealPlan({...meals,lunch:{...plate,macros:{proteinGrams:40}}},{proteinGrams:160}).factor,1)
  assert.equal(mealTotals({lunch:{macros:{proteinGrams:40}}}).calories,null)
})
test('ingredient quantities scale fractions, decimals and mixed fractions accurately',()=>{
  assert.equal(scaledIngredient('6 oz chicken breast',1.07),'6.4 oz chicken breast')
  assert.equal(scaledIngredient('1/2 cup spinach',2),'1 cup spinach')
  assert.equal(scaledIngredient('1 1/2 cups rice',2),'3 cups rice')
})
test('batch recipe ingredients are divided by the recorded yield before member portion scaling',()=>{
  assert.deepEqual(portionIngredients({yieldQuantity:4,portionMultiplier:1.07,ingredients:['24 oz chicken breast','4 cups broccoli']}),['6.4 oz chicken breast','1.1 cups broccoli'])
  assert.deepEqual(portionIngredients({portionMultiplier:1,ingredients:['6 oz chicken breast']}),['6 oz chicken breast'])
})
test('existing three-slot days leave snacks empty and allow a deliberate addition',()=>{
  const day={date:'2026-10-01',version:7,meals:{breakfast:'breakfast-01',lunch:'lunch-01',dinner:'dinner-01'}}
  const resolved=resolveMealDay(day)
  assert.equal(resolved.resolvedMeals.snack1,null)
  assert.equal(resolved.resolvedMeals.snack2,null)
  assert.equal(day.meals.snack1,undefined)
  const operation={id:'swap',type:'meal.substitute',targetDate:day.date,payload:{mealType:'snack2',mealId:'breakfast-01'}}
  const changed=applyRecordOperation(day,operation,{actor:'Larry'})
  assert.deepEqual(changed.before,day)
  assert.equal(changed.after.meals.snack2,'breakfast-01')
  assert.equal(changed.after.substitutions.snack2.previousMealId,null)
  assert.deepEqual(resolveMealDay(changed.before).meals,resolved.meals)
})

test('three main meals form a complete plan without optional snack calories',()=>{
 const result=personalMealPlan({breakfast:plate,lunch:plate,dinner:plate},{})
 assert.equal(result.complete,true);assert.equal(result.totals.calories,1200)
})

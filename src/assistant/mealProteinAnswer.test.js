import test from 'node:test'
import assert from 'node:assert/strict'
import { mealProteinFocus } from '../../netlify/lib/assistant-meal-protein.mjs'

const context={householdDate:'2026-09-27',sources:[{id:'rolling-meals',state:'available'}],rollingMealPlan:{days:[{date:'2026-09-27',meals:{breakfast:{name:'Yogurt',macros:{proteinGrams:24}},lunch:{name:'Chicken',macros:{proteinGrams:83}},dinner:{name:'Cod',macros:{proteinGrams:42}}}}]}}
const transcript=[{role:'user',content:"If I eat today's meals will I hit my protein goal for the day?"},{role:'assistant',content:'What is your goal?'},{role:'user',content:'My goal is 200 g of protein each day. What additionally can I eat to make up the difference?'}]

test('focuses ChatGPT on canonical meals, user goal and shortfall across turns',()=>{
  const focus=mealProteinFocus(transcript,context)
  assert.equal(focus.recordedTotalGrams,149)
  assert.equal(focus.goalGrams,200)
  assert.equal(focus.goalSource,'member-stated in conversation')
  assert.equal(focus.differenceGrams,51)
  assert.deepEqual(focus.meals.map(meal=>meal.proteinGrams),[24,83,42])
  assert.equal(mealProteinFocus([...transcript,{role:'user',content:"You didn't answer my question"}],context).differenceGrams,51)
})
test('does not hijack unrelated questions or invent absent macro values',()=>{
  assert.equal(mealProteinFocus([...transcript,{role:'user',content:'What is my operating balance?'}],context),null)
  const missing={...context,rollingMealPlan:{days:[{date:'2026-09-27',meals:{breakfast:{name:'Yogurt',macros:{proteinGrams:24}},lunch:{name:'Chicken'},dinner:{name:'Cod',macros:{proteinGrams:42}}}}]}}
  const focus=mealProteinFocus(transcript,missing)
  assert.equal(focus.complete,false)
  assert.equal(focus.differenceGrams,null)
  assert.equal(focus.meals[1].proteinGrams,null)
})

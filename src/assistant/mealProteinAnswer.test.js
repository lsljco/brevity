import test from 'node:test'
import assert from 'node:assert/strict'
import { answerTodayMealProtein } from '../../netlify/lib/assistant-meal-protein.mjs'

const question = "Have you worked those out if I eat the meals from today's meal plan will I hit my protein goal for the day"
const context = {
  householdDate:'2026-09-27',
  sources:[{id:'rolling-meals',state:'available'}],
  rollingMealPlan:{days:[{date:'2026-09-27',meals:{breakfast:{name:'Eggs',macros:{proteinGrams:40}},lunch:{name:'Chicken',macros:{proteinGrams:65}},dinner:{name:'Salmon',macros:{proteinGrams:55}}}}]},
}

test('answers the exact meal plan question from the canonical date and macros', () => {
  const answer=answerTodayMealProtein(question,context)
  assert.match(answer,/160 g/)
  assert.match(answer,/Eggs — 40 g/)
  assert.match(answer,/saved daily protein goal/)
  assert.match(answer,/2026-09-27/)
})
test('compares with an actually saved goal and flags missing macros', () => {
  assert.match(answerTodayMealProtein(question,{...context,dailyPlan:{health:{proteinGoalGrams:180}}}),/20 g short/)
  const missing={...context,rollingMealPlan:{days:[{date:'2026-09-27',meals:{breakfast:{name:'Eggs',macros:{proteinGrams:40}},lunch:{name:'Unknown macros'},dinner:{name:'Salmon',macros:{proteinGrams:55}}}}]}}
  assert.match(answerTodayMealProtein(question,{...missing,dailyPlan:{health:{proteinGoalGrams:180}}}),/can't determine whether the full plan meets it/)
})
test('does not route unrelated questions and does not invent unavailable meal data', () => {
  assert.equal(answerTodayMealProtein('What is my operating balance?',context),null)
  assert.match(answerTodayMealProtein(question,{...context,sources:[{id:'rolling-meals',state:'unavailable'}]}),/can't verify/)
})

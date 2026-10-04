import assert from 'node:assert/strict'
import test from 'node:test'
import { nutritionProgress, suggestPlannedMeals, weeklyNutritionPilot } from '../../netlify/lib/nutrition-progress.mjs'

test('remaining guidance uses only saved targets and confirmed totals',()=>{
  const result=nutritionProgress({calories:870,proteinGrams:54,carbohydrateGrams:50,fatGrams:45},{calories:2100,proteinGrams:150,carbohydrateGrams:200,fatGrams:70})
  assert.equal(result.nutrients.proteinGrams.remaining,96)
  assert.equal(result.nutrients.calories.remaining,1230)
  assert.match(result.guidance.join(' '),/96 g/)
  assert.match(result.notice,/confirmed saved meals/)
})

test('over-target values do not become negative remaining values',()=>{
  const result=nutritionProgress({calories:2200,proteinGrams:60,carbohydrateGrams:120,fatGrams:80},{calories:2000,proteinGrams:140,fatGrams:60})
  assert.equal(result.nutrients.calories.remaining,0)
  assert.equal(result.nutrients.calories.over,200)
  assert.equal(result.nutrients.fatGrams.over,20)
  assert.equal(result.nutrients.carbohydrateGrams.remaining,null)
})

test('no target does not create a nutrition goal',()=>{
  const result=nutritionProgress({calories:500,proteinGrams:40},{})
  assert.equal(result.nutrients.proteinGrams.target,null)
  assert.equal(result.nutrients.proteinGrams.remaining,null)
  assert.deepEqual(result.guidance,['Set your personal daily targets to see remaining amounts and tailored guidance.'])
})

test('planned options fit the saved remainder and are never represented as consumed',()=>{
  const progress=nutritionProgress({calories:1000,proteinGrams:80,carbohydrateGrams:80,fatGrams:35},{calories:2000,proteinGrams:140,carbohydrateGrams:180,fatGrams:70})
  const day={date:'2026-09-28',meals:{
    breakfast:{name:'Large brunch',macros:{calories:1100,proteinGrams:55,carbohydrateGrams:90,fatGrams:35}},
    lunch:{name:'Chicken plate',macros:{calories:450,proteinGrams:45,carbohydrateGrams:30,fatGrams:12}},
    dinner:{name:'Fish plate',macros:{calories:650,proteinGrams:55,carbohydrateGrams:35,fatGrams:22}},
  }}
  const options=suggestPlannedMeals(progress,{days:[day]},'2026-09-28')
  assert.deepEqual(options.map(option=>option.name),['Chicken plate'])
  assert.match(options[0].notice,/not recorded as eaten/)
  assert.deepEqual(suggestPlannedMeals(progress,{days:[day]},'2026-09-27'),[])
})

test('pilot counts confirmed entries and flags identical foods without deleting them',()=>{
  const first={id:'one',date:'2026-09-28',ingredients:[{input:'2 slices toast'}],macros:{calories:140,proteinGrams:6}}
  const second={...first,id:'two',name:'Lunch',correctedAt:'2026-09-28T12:00:00Z'}
  const result=weeklyNutritionPilot([{date:'2026-09-28',entries:[first,second]},{date:'2026-09-27',entries:[]}])
  assert.equal(result.confirmedMeals,2)
  assert.equal(result.daysWithMeals,1)
  assert.equal(result.correctedMeals,1)
  assert.deepEqual(result.possibleDuplicates,[{date:'2026-09-28',entryIds:['one','two']}])
  assert.match(result.notice,/can represent separate meals/)
})

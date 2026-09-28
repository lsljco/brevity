import assert from 'node:assert/strict'
import test from 'node:test'
import { nutritionProgress } from '../../netlify/lib/nutrition-progress.mjs'

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

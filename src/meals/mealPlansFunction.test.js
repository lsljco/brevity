import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../../netlify/functions/meal-plans.mjs', import.meta.url), 'utf8')

test('meal-plan GET requests use the non-persisting window reader', () => {
  const getBranchStart = source.indexOf("if (event.httpMethod === 'GET')")
  const putBranchStart = source.indexOf("if (event.httpMethod === 'PUT')", getBranchStart)

  assert.notEqual(getBranchStart, -1, 'expected the meal-plan GET branch')
  assert.notEqual(putBranchStart, -1, 'expected the meal-plan PUT branch after GET')

  const getBranch = source.slice(getBranchStart, putBranchStart)
  assert.match(getBranch, /repository\.getWindowReadOnly\s*\(/)
  assert.doesNotMatch(getBranch, /repository\.getWindow\s*\(/)
})

test('meal image regeneration uses the authoritative meal ingredients and persists an override', () => {
  assert.match(source,/\['regenerate-image','upload-image'\]\.includes\(body\.action\)/)
  assert.match(source,/libraryState\.library\.find\(candidate => candidate\.id === body\.mealId\)/)
  assert.match(source,/generateMealImage\(\{ meal:\{ \.\.\.meal, image:'' \}/)
  assert.match(source,/repository\.setMealImage\(/)
})

test('meal image upload validates bytes and saves them through the same household override',()=>{
  assert.match(source,/body\.action === 'upload-image'/)
  assert.match(source,/mealImageContentType\(bytes\)/)
  assert.match(source,/imageStore\.set\(mealImageKey/)
})

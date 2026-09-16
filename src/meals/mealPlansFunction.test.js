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

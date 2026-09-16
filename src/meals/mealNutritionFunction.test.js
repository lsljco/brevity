import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source=readFileSync(new URL('../../netlify/functions/meal-nutrition.mjs',import.meta.url),'utf8')

test('meal nutrition endpoint requires an authenticated session and accepts POST only',()=>{
  assert.match(source,/readSession\(event\)/)
  assert.match(source,/if\(event\.httpMethod!==['"]POST['"]\)/)
  assert.match(source,/statusCode:204/)
  assert.match(source,/path:['"]\/\.netlify\/functions\/meal-nutrition['"]/)
})

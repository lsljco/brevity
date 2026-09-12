import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source=readFileSync(new URL('../../netlify/functions/recipe-import.mjs',import.meta.url),'utf8')

test('recipe import endpoint is authenticated, POST-only and never persists an unreviewed import',()=>{
  assert.match(source,/readSession\(event\)/)
  assert.match(source,/event\.httpMethod !== ['"]POST['"]/) 
  assert.match(source,/statusCode:204/)
  assert.match(source,/path:['"]\/\.netlify\/functions\/recipe-import['"]/) 
  assert.doesNotMatch(source,/\.setJSON|\.set\(/)
})

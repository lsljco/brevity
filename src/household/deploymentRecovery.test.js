import assert from 'node:assert/strict'
import test from 'node:test'
import { deploymentRecoveryUrl, isDeploymentChunkError, recoverCurrentDeployment } from '../deploymentRecovery.js'

test('recognizes browser module and lazy-chunk deployment failures', () => {
  assert.equal(isDeploymentChunkError(new Error('Importing a module script failed.')), true)
  assert.equal(isDeploymentChunkError(new Error('Failed to fetch dynamically imported module')), true)
  assert.equal(isDeploymentChunkError(new Error('A normal render failed')), false)
})

test('cache-busted deployment recovery navigates once and is loop guarded', () => {
  const values = new Map()
  const storage = { getItem:key=>values.get(key) || null, setItem:(key,value)=>values.set(key,value) }
  const replacements = []
  const location = { href:'https://brevityoflife.netlify.app/finance?view=dashboard', replace:url=>replacements.push(url) }
  const error = new Error('Importing a module script failed.')

  assert.equal(recoverCurrentDeployment({ error, location, storage, now:100_000 }), true)
  assert.equal(replacements.length, 1)
  assert.match(replacements[0], /view=dashboard/)
  assert.match(replacements[0], /_brevity_reload=100000/)
  assert.equal(recoverCurrentDeployment({ error, location, storage, now:110_000 }), false)
  assert.equal(replacements.length, 1)
  assert.equal(recoverCurrentDeployment({ error, location, storage, now:131_000 }), true)
})

test('ordinary application errors never trigger deployment navigation', () => {
  const replacements = []
  assert.equal(recoverCurrentDeployment({
    error:new Error('A normal render failed'),
    location:{ href:'https://brevityoflife.netlify.app/', replace:url=>replacements.push(url) },
    storage:{ getItem:()=>null, setItem:()=>{} },
    now:100,
  }), false)
  assert.deepEqual(replacements, [])
  assert.match(deploymentRecoveryUrl({ href:'https://brevityoflife.netlify.app/' }, 123), /_brevity_reload=123/)
})

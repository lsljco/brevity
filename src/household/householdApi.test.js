import assert from 'node:assert/strict'
import test from 'node:test'
import { saveDailyPlan } from './householdApi.js'

test('browser daily-plan replacement is disabled before any network write', async () => {
  const originalFetch = globalThis.fetch
  let calls=0
  globalThis.fetch = async () => { calls+=1; throw new Error('must not fetch') }
  try {
    assert.throws(() => saveDailyPlan({ date:'2026-08-26', version:4 }), error => error.code === 'ACTION_REVIEW_REQUIRED' && /Action Mode/.test(error.message))
    assert.equal(calls,0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('the disabled API never accepts a candidate or expected version', () => {
  assert.throws(() => saveDailyPlan(), /Direct daily-plan saves are disabled/)
})

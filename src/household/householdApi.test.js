import assert from 'node:assert/strict'
import test from 'node:test'
import { saveDailyPlan } from './householdApi.js'

test('daily-plan saves send the version required for conflict detection', async () => {
  const originalFetch = globalThis.fetch
  let requestBody
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return new Response(JSON.stringify({ plan: { ...requestBody.plan, version: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const saved = await saveDailyPlan({ date: '2026-08-26', version: 4 })
    assert.equal(requestBody.expectedVersion, 4)
    assert.equal(saved.version, 5)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('daily-plan conflicts expose the current server plan to the caller', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'Another device updated this household plan.',
    plan: { date: '2026-08-26', version: 7, theme: 'Latest household plan' },
  }), { status: 409, headers: { 'content-type': 'application/json' } })
  try {
    await assert.rejects(
      () => saveDailyPlan({ date: '2026-08-26', version: 6 }),
      error => error.status === 409 && error.currentPlan.version === 7,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

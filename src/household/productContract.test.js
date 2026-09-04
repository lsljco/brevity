import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PILLAR_IDS,
  SHARED_SPIRITUAL_OWNER,
  SHARED_SPIRITUAL_SCOPE,
  createEmptyDailyPlan,
  normalizeDailyPlan,
} from './dailyPlan.js'

test('seven pillars remain in the approved operating order', () => {
  assert.deepEqual(PILLAR_IDS, ['spiritual','health','fitness','household','education','finance','ministry'])
})

test('Spiritual Maturity is always normalized as a shared household devotion', () => {
  const empty = createEmptyDailyPlan('2026-09-04')
  assert.equal(empty.spiritual.owner, SHARED_SPIRITUAL_OWNER)
  assert.equal(empty.spiritual.scope, SHARED_SPIRITUAL_SCOPE)

  const legacy = normalizeDailyPlan({
    date:'2026-09-04',
    spiritual:{ owner:'Lorenzo', devotionFocus:'Legacy devotion ownership' },
  })
  assert.equal(legacy.spiritual.owner, 'Family')
  assert.equal(legacy.spiritual.scope, 'household')
  assert.equal(legacy.spiritual.devotionFocus, 'Legacy devotion ownership')
})

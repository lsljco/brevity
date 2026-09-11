import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDailyPlanActionPayload } from '../../netlify/lib/daily-plan-action-fields.mjs'
import { buildAlignmentOperations } from './dailyPlanActionReview.js'
import { createEmptyDailyPlan } from './dailyPlan.js'

test('Isaiah standing owner is not sent as an editable alignment field', () => {
  const original = createEmptyDailyPlan('2026-09-11')
  original.version = 3
  const draft = structuredClone(original)
  draft.education.isaiah.readingMinutes = 30

  const education = buildAlignmentOperations(original, draft).find(operation => operation.targetId === 'education')

  assert.ok(education)
  assert.equal(education.payload.patch.isaiah.owner, undefined)
  assert.doesNotThrow(() => normalizeDailyPlanActionPayload(education.type, education.payload))
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { DECISION_STATUS, DECISION_STATUS_OPTIONS, countOpenDecisions, normalizeDailyPlan, normalizeDecisionStatus } from './dailyPlan.js'

test('decision statuses expose only the four household decision states', () => {
  assert.deepEqual(Object.values(DECISION_STATUS), ['needs-decision', 'determined', 'complete', 'deferred'])
  assert.deepEqual(DECISION_STATUS_OPTIONS, [
    { value: 'needs-decision', label: 'Needs Decision' },
    { value: 'determined', label: 'Determined' },
    { value: 'complete', label: 'Complete' },
    { value: 'deferred', label: 'Deferred' },
  ])
})

test('legacy decision statuses migrate without losing their workflow meaning', () => {
  assert.equal(normalizeDecisionStatus('needs-decision'), DECISION_STATUS.needsDecision)
  assert.equal(normalizeDecisionStatus('pending'), DECISION_STATUS.needsDecision)
  assert.equal(normalizeDecisionStatus('open'), DECISION_STATUS.needsDecision)
  assert.equal(normalizeDecisionStatus('ready'), DECISION_STATUS.determined)
  assert.equal(normalizeDecisionStatus('in-progress'), DECISION_STATUS.determined)
  assert.equal(normalizeDecisionStatus('complete'), DECISION_STATUS.complete)
  assert.equal(normalizeDecisionStatus('deferred'), DECISION_STATUS.deferred)
})

test('saved daily plans normalize legacy decisions and keep determined decisions active', () => {
  const plan = normalizeDailyPlan({
    date: '2026-08-26',
    decisions: [
      { id: 'open', status: 'pending' },
      { id: 'ready', status: 'ready' },
      { id: 'working', status: 'in-progress' },
      { id: 'done', status: 'complete' },
      { id: 'later', status: 'deferred' },
    ],
  })

  assert.deepEqual(plan.decisions.map(item => item.status), [
    DECISION_STATUS.needsDecision,
    DECISION_STATUS.determined,
    DECISION_STATUS.determined,
    DECISION_STATUS.complete,
    DECISION_STATUS.deferred,
  ])
  assert.equal(countOpenDecisions(plan), 3)
})

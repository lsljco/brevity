import assert from 'node:assert/strict'
import test from 'node:test'
import { DECISION_STATUS, DECISION_STATUS_OPTIONS, countOpenDecisions, normalizeDailyPlan, normalizeDecisionStatus } from './dailyPlan.js'
import { normalizeDailyPlanItemStatus } from './dailyPlanStatus.js'

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

test('generated workflow status labels normalize to the Daily Plan contract', () => {
  assert.equal(normalizeDailyPlanItemStatus('Not Started'), 'pending')
  assert.equal(normalizeDailyPlanItemStatus('IN_PROGRESS'), 'in-progress')
  assert.equal(normalizeDailyPlanItemStatus('Completed'), 'complete')
  assert.equal(normalizeDailyPlanItemStatus('Needs Decision'), 'needs-decision')
  assert.equal(normalizeDailyPlanItemStatus('unexpected-state'), 'unexpected-state')
})

test('saved plan items normalize safe legacy statuses in every reviewable section', () => {
  const item = status => ({ id:status, title:status, status })
  const plan = normalizeDailyPlan({
    date:'2026-09-09',
    topPriorities:[item('Not Started')],
    assignments:[item('Completed')],
    household:{ appointments:[item('IN_PROGRESS')], priorities:[item('planned')] },
    finance:{ bills:[item('scheduled')], purchases:[], transfers:[], accountsToFund:[] },
    ministry:{ meetings:[item('active')], fellowshipFollowUps:[item('postponed')] },
  })
  assert.equal(plan.topPriorities[0].status, 'pending')
  assert.equal(plan.assignments[0].status, 'complete')
  assert.equal(plan.household.appointments[0].status, 'in-progress')
  assert.equal(plan.household.priorities[0].status, 'pending')
  assert.equal(plan.finance.bills[0].status, 'pending')
  assert.equal(plan.ministry.meetings[0].status, 'in-progress')
  assert.equal(plan.ministry.fellowshipFollowUps[0].status, 'deferred')
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

test('standing education and gym routines never become daily decisions', () => {
  const plan = normalizeDailyPlan({
    date: '2026-08-27',
    fitness: { location: 'Lifetime Buckhead', requiresDecision: true },
    education: { isaiah: { owner: '' } },
    decisions: [
      { id: 'gym', title: 'Which Lifetime gym location are we using?', status: 'needs-decision' },
      { id: 'education', title: 'Who is accountable for Isaiah’s education block?', status: 'needs-decision' },
      { id: 'real', title: 'Approve the contractor proposal', status: 'needs-decision' },
    ],
  })

  assert.equal(plan.fitness.location, 'Lifetime Gym')
  assert.equal(plan.fitness.requiresDecision, false)
  assert.equal(plan.education.isaiah.owner, 'Family')
  assert.deepEqual(plan.decisions.map(item => item.id), ['real'])
  assert.equal(countOpenDecisions(plan), 1)
})

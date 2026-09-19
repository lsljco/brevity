import test from 'node:test'
import assert from 'node:assert/strict'
import { PRACTICE_TEMPLATES, blankMealReadiness, dailyPracticeCards, emptyPracticeDay, mealReadiness, practiceAppliesOn, practiceDayOperation, practiceRoutineDateAllowed, practiceRoutineNotes, readPracticeDay, readPracticeRoutine, shiftPracticeDate, validPracticeDate, validatePracticeDay, withPracticeCheckin } from './operatingPractices.js'
import { normalizeDailyPlanActionPayload } from '../../netlify/lib/daily-plan-action-fields.mjs'
import { normalizeDailyPlan } from './dailyPlan.js'
import { buildPlanDraftOperations } from './dailyPlanActionReview.js'

const date = '2026-09-21'
const routine = (changes = {}) => ({ id: 'routine-a', title: 'Financial review', owner: 'Larry', participants: [], enabled: true, startTime: '06:00', endTime: '06:15', days: [1, 2, 3, 4, 5], notes: practiceRoutineNotes({ policyId: 'FIN-001', revision: 1, effectiveDate: date, reviewDate: '2026-09-28', backup: 'Lorenzo', procedure: 'Review available transactions, obligations and funded allowances.' }), ...changes })
const plan = (practiceDay = emptyPracticeDay()) => normalizeDailyPlan({ date, version: 4, household: { practiceDay } })
const readyMeal = () => ({ ...blankMealReadiness('Test meal'), owner: 'Terica', backup: 'Javin', readyBy: '12:00', headcount: 4, inventoryChecked: true, ingredientsReady: true, preparation: 'ready', location: 'Labeled refrigerator shelf', communicated: true, fallback: 'Pantry meal with agreed coverage' })

test('three starter agreements have procedures and do not assign an owner', () => {
  assert.deepEqual(PRACTICE_TEMPLATES.map(item => item.id), ['FIN-001', 'OPS-001', 'MEAL-001'])
  assert.ok(PRACTICE_TEMPLATES.every(item => item.purpose && item.standard && item.steps && item.outcome && !item.owner))
})
test('policy marker round-trips through native routine notes', () => {
  const result = readPracticeRoutine(routine())
  assert.equal(result.policyId, 'FIN-001'); assert.equal(result.backup, 'Lorenzo'); assert.equal(result.revision, 1)
  assert.match(result.procedure, /Review available transactions/)
})
test('invalid dates are rejected, not rolled into the following month', () => {
  assert.equal(validPracticeDate('2026-02-30'), false)
  assert.equal(validPracticeDate('2026-13-01'), false)
  assert.equal(validPracticeDate('2028-02-29'), true)
  assert.throws(() => shiftPracticeDate('not-a-date', 1))
})
test('date arithmetic remains date-based across daylight-saving boundaries', () => {
  assert.equal(shiftPracticeDate('2026-03-08', 1), '2026-03-09')
  assert.equal(shiftPracticeDate('2026-11-01', -1), '2026-10-31')
  assert.equal(shiftPracticeDate('2026-12-31', 1), '2027-01-01')
})
test('invalid policy or backup cannot create an agreement marker', () => {
  assert.throws(() => practiceRoutineNotes({ policyId: 'OTHER', effectiveDate: date, reviewDate: date, backup: 'Lorenzo', procedure: 'Do work' }))
  assert.throws(() => practiceRoutineNotes({ policyId: 'FIN-001', effectiveDate: date, reviewDate: date, backup: 'Isaiah', procedure: 'Do work' }))
  assert.throws(() => practiceRoutineNotes({ policyId: 'FIN-001', effectiveDate: date, reviewDate: '2026-09-20', backup: 'Lorenzo', procedure: 'Do work' }))
})
test('future and paused agreements do not produce a current obligation', () => {
  assert.equal(practiceAppliesOn(routine(), '2026-09-20'), false)
  assert.equal(practiceAppliesOn(routine({ enabled: false }), date), false)
  assert.equal(practiceAppliesOn(routine(), date), true)
  assert.equal(practiceAppliesOn(routine(), '2026-09-26'), false)
})
test('effective-date guard leaves ordinary routines unchanged', () => {
  assert.equal(practiceRoutineDateAllowed({ notes: 'Normal household routine' }, date), true)
  assert.equal(practiceRoutineDateAllowed(routine(), '2026-09-20'), false)
  assert.equal(practiceRoutineDateAllowed(routine(), date), true)
  assert.equal(practiceRoutineDateAllowed({ notes: '[Brevity practice corrupt]' }, date), false)
})
test('unconfigured agreements are setup needs, never automatically completed', () => {
  const cards = dailyPracticeCards({ routines: [] }, plan())
  assert.equal(cards.length, 3); assert.ok(cards.every(card => card.state === 'setup'))
})
test('missing check-in means unrecorded, not violation', () => {
  const card = dailyPracticeCards({ routines: [routine()] }, plan())[0]
  assert.equal(card.state, 'unrecorded'); assert.match(card.label, /not a violation/)
})
test('duplicate active agreements are surfaced instead of executed twice', () => {
  const card = dailyPracticeCards({ routines: [routine(), routine({ id: 'duplicate' })] }, plan())[0]
  assert.equal(card.state, 'needs-attention'); assert.match(card.label, /Duplicate/)
})
test('a skipped native routine remains an explicit exception', () => {
  const schedule = { routines: [routine()], routineOverrides: { [`routine-a:${date}`]: { cancelled: true } } }
  assert.equal(dailyPracticeCards(schedule, plan())[0].state, 'exception')
})
test('check-in replacement is idempotent for a routine on a date', () => {
  const practice = readPracticeRoutine(routine())
  const first = withPracticeCheckin(plan(), practice, 'complete', 'Review performed')
  const second = withPracticeCheckin(plan(first), practice, 'blocked', 'Need the statement', 'Owner will retry after the source is restored')
  assert.equal(second.checkins.length, 1); assert.equal(second.checkins[0].status, 'blocked')
})
test('blocked work and exceptions require a reason and recovery action', () => {
  const practice = readPracticeRoutine(routine())
  assert.throws(() => withPracticeCheckin(plan(), practice, 'blocked', '', ''))
  assert.throws(() => withPracticeCheckin(plan(), practice, 'exception', 'Unavailable', ''))
})
test('a new agreement version does not inherit a completion claim', () => {
  const old = routine(), record = withPracticeCheckin(plan(), readPracticeRoutine(old), 'complete')
  const revised = routine({ notes: old.notes.replace('version=1', 'version=2') })
  const card = dailyPracticeCards({ routines: [revised] }, plan(record))[0]
  assert.equal(card.state, 'unrecorded'); assert.equal(card.checkin.revision, 1)
})
test('a broken saved record is reported without silently treating it as success', () => {
  const result = readPracticeDay({ household: { practiceDay: { schemaVersion: 99 } } })
  assert.ok(result.error); assert.equal(result.data.checkins.length, 0)
})
test('extra monetary, actor, or arbitrary fields are rejected by the schema', () => {
  assert.throws(() => validatePracticeDay({ ...emptyPracticeDay(), amount: 100 }))
  const value = withPracticeCheckin(plan(), readPracticeRoutine(routine()), 'complete')
  value.checkins[0].approvedBy = 'Someone else'
  assert.throws(() => validatePracticeDay(value))
})
test('duplicate routine records cannot inflate reported activity', () => {
  const value = withPracticeCheckin(plan(), readPracticeRoutine(routine()), 'complete')
  value.checkins.push({ ...value.checkins[0] })
  assert.throws(() => validatePracticeDay(value))
})
test('a recipe and meal plan alone are not preparation evidence', () => {
  assert.equal(mealReadiness({ name: 'Test meal' }).state, 'needs-attention')
  assert.equal(mealReadiness(null, readyMeal()).state, 'unknown')
})
test('substituting a meal invalidates its previous availability signal', () => {
  const result = mealReadiness({ name: 'Different meal' }, readyMeal())
  assert.equal(result.state, 'changed')
})
test('available and communicated meal can be ready without claiming it was eaten', () => {
  const meal = readyMeal()
  assert.equal(mealReadiness({ name: meal.mealName }, meal).state, 'ready')
  assert.equal(meal.portionsEaten, null)
})
test('prepared but uncommunicated food remains a communication action', () => {
  const meal = { ...readyMeal(), communicated: false }
  assert.equal(mealReadiness({ name: meal.mealName }, meal).state, 'needs-attention')
})
test('preparation cannot be marked ready without coverage and location', () => {
  const value = emptyPracticeDay(); value.meals.lunch = { ...readyMeal(), owner: '' }
  assert.throws(() => validatePracticeDay(value))
})
test('communication cannot be recorded before the meal is available', () => {
  const value = emptyPracticeDay(); value.meals.lunch = { ...readyMeal(), preparation: 'planned' }
  assert.throws(() => validatePracticeDay(value))
})
test('zero and unknown consumed portions remain distinct', () => {
  const value = emptyPracticeDay(); value.meals.lunch = { ...readyMeal(), portionsEaten: 0 }
  assert.equal(validatePracticeDay(value).meals.lunch.portionsEaten, 0)
  value.meals.lunch.portionsEaten = null
  assert.equal(validatePracticeDay(value).meals.lunch.portionsEaten, null)
})
test('a meal that is not required needs an explicit reason', () => {
  const value = emptyPracticeDay(); value.meals.lunch = { ...blankMealReadiness(), notRequired: true }
  assert.throws(() => validatePracticeDay(value))
  value.meals.lunch.exception = 'Everyone has a planned meal away from home'
  assert.equal(mealReadiness(null, validatePracticeDay(value).meals.lunch).state, 'exception')
})
test('a weekly review requires actual notes', () => {
  assert.throws(() => validatePracticeDay({ ...emptyPracticeDay(), review: { completed: true, notes: '' } }))
})
test('practice changes are scoped to the current daily plan and existing Action Mode', () => {
  const operation = practiceDayOperation(plan(), emptyPracticeDay())
  assert.equal(operation.type, 'plan.pillar.update'); assert.equal(operation.targetDate, date)
  assert.deepEqual(Object.keys(operation.payload.patch), ['practiceDay'])
})
test('server normalizer accepts only the bounded human-reviewed practice patch', () => {
  const operation = practiceDayOperation(plan(), emptyPracticeDay())
  assert.deepEqual(normalizeDailyPlanActionPayload(operation.type, operation.payload), operation.payload)
  assert.throws(() => normalizeDailyPlanActionPayload(operation.type, { ...operation.payload, origin: 'generated-draft' }))
  assert.throws(() => normalizeDailyPlanActionPayload(operation.type, { ...operation.payload, other: true }))
})
test('other daily-plan field protections and core normalizers are unchanged', () => {
  assert.deepEqual(normalizeDailyPlanActionPayload('plan.pillar.update', { pillar: 'health', patch: { dinner: 'Test dinner' } }), { pillar: 'health', patch: { dinner: 'Test dinner' } })
  assert.throws(() => normalizeDailyPlanActionPayload('plan.pillar.update', { pillar: 'finance', patch: { practiceDay: emptyPracticeDay() } }))
  assert.throws(() => normalizeDailyPlanActionPayload('plan.pillar.update', { pillar: 'household', patch: { practiceDay: emptyPracticeDay(), secret: 'not allowed' } }))
})
test('normalization preserves saved practice records across ordinary plan refreshes', () => {
  const value = withPracticeCheckin(plan(), readPracticeRoutine(routine()), 'complete')
  assert.deepEqual(normalizeDailyPlan(plan(value)).household.practiceDay, value)
})
test('AI-generated plans cannot replace the recorded practice evidence', () => {
  const current = plan(withPracticeCheckin(plan(), readPracticeRoutine(routine()), 'complete'))
  const draft = cloneForTest(current); draft.theme = 'Updated plan'; draft.household.practiceDay = emptyPracticeDay()
  const operations = buildPlanDraftOperations(current, draft)
  assert.ok(operations.every(operation => !Object.hasOwn(operation.payload.patch, 'practiceDay')))
})
function cloneForTest(value) { return JSON.parse(JSON.stringify(value)) }

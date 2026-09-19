import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEmptyDailyPlan } from './dailyPlan.js'
import { dailyPracticeCards, emptyPracticeDay, practiceDayOperation, practiceRoutineNotes, readPracticeRoutine, summarizePracticeWeek, withPracticeCheckin } from './operatingPractices.js'
import { householdScheduleCalendarEvents, normalizeHouseholdScheduleState, routineOccurrencesForDate } from './householdScheduleData.js'
import { defaultActionPermissions, normalizeActionProposal } from '../../netlify/lib/assistant-action-contract.mjs'
import { captureExpectedVersions, executeRecordOperations } from '../../netlify/lib/assistant-action-executor.mjs'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { executeActionWithJournal, undoActionWithJournal } from '../../netlify/functions/brevity-assistant-actions.mjs'

const date = '2026-09-21'
const instant = new Date(`${date}T12:00:00Z`)
const session = { member: 'Larry', role: 'admin' }
const routine = () => ({ id: 'policy-finance', title: 'Daily finance review', owner: 'Larry', participants: ['Terica'], enabled: true, startTime: '06:00', endTime: '06:15', days: [0,1,2,3,4,5,6], notes: practiceRoutineNotes({ policyId: 'FIN-001', effectiveDate: date, reviewDate: '2026-09-28', backup: 'Lorenzo', procedure: 'Review obligations and funded allowances; record remaining questions.' }) })
const initialPlan = () => ({ ...createEmptyDailyPlan(date), version: 3, finance: { owner: 'Larry', bills: [{ id: 'bill', amount: 25 }], decisionRule: 'Preserve obligations' }, household: { owner: 'Larry', priorities: [{ id: 'original', title: 'Preserve this responsibility' }], practiceDay: emptyPracticeDay() } })
function proposalFor(plan, value, id = 'practice-proposal') {
  return normalizeActionProposal({ summary: 'Review household practice result', operations: [practiceDayOperation(plan, value)] }, { ...session, now: instant, id })
}
function resourcesFor(plan) {
  let value = structuredClone(plan), version = plan.version, writes = 0
  return {
    get value() { return structuredClone(value) }, get writes() { return writes },
    changeVersion() { version += 1; value.version = version },
    async read() { return { value: structuredClone(value), version } },
    async write(resource, next, expected, actor, mutationId) {
      assert.equal(resource, `plan:${date}`)
      if (expected !== version) throw Object.assign(new Error('Version changed'), { code: 'VERSION_CONFLICT' })
      writes += 1; version += 1
      value = { ...structuredClone(next), version, updatedBy: actor, lastActionId: mutationId }
      return { value: structuredClone(value), version }
    },
  }
}
function versionedBlobStore() {
  const values = new Map(); let sequence = 0
  const clone = value => value == null ? value : structuredClone(value)
  return {
    values,
    async get(key) { return clone(values.get(key)?.data ?? null) },
    async getWithMetadata(key) { const entry = values.get(key); return entry ? { data: clone(entry.data), etag: entry.etag } : null },
    async setJSON(key, value, options = {}) {
      const current = values.get(key)
      if (options.onlyIfNew && current) return { modified: false, etag: current.etag }
      if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false, etag: current?.etag || null }
      const etag = `etag-${++sequence}`; values.set(key, { data: clone(value), etag }); return { modified: true, etag }
    },
  }
}

test('a practice update executes through the existing plan resource without changing finance or assignments', async () => {
  const before = initialPlan(), resources = resourcesFor(before)
  const data = withPracticeCheckin(before, readPracticeRoutine(routine()), 'complete', 'Review performed')
  const proposal = await captureExpectedVersions(proposalFor(before, data), resources)
  const result = await executeRecordOperations({ proposal, selections: {}, session, permissions: defaultActionPermissions('admin'), resources })
  assert.equal(resources.writes, 1)
  assert.equal(result.changes[0].afterVersion, 4)
  assert.deepEqual(resources.value.finance, before.finance)
  assert.deepEqual(resources.value.assignments, before.assignments)
  assert.deepEqual(resources.value.household.priorities, before.household.priorities)
  assert.equal(resources.value.household.practiceDay.checkins[0].status, 'complete')
})

test('a stale practice proposal stops before every write', async () => {
  const before = initialPlan(), resources = resourcesFor(before)
  const proposal = await captureExpectedVersions(proposalFor(before, emptyPracticeDay()), resources)
  resources.changeVersion()
  await assert.rejects(() => executeRecordOperations({ proposal, selections: {}, session, permissions: defaultActionPermissions('admin'), resources }), error => error.code === 'VERSION_CONFLICT')
  assert.equal(resources.writes, 0)
})

test('practice records do not grant planning permission to a restricted household member', async () => {
  const before = initialPlan(), resources = resourcesFor(before)
  const proposal = await captureExpectedVersions(proposalFor(before, emptyPracticeDay()), resources)
  await assert.rejects(() => executeRecordOperations({ proposal, selections: {}, session: { member: 'Nyla', role: 'member' }, permissions: { planning: false, finance: false, calendar: false, projects: false }, resources }), error => error.code === 'FORBIDDEN')
  assert.equal(resources.writes, 0)
})

test('a reviewed practice write journals once and safely undoes the dated record', async () => {
  const before = initialPlan(), resources = resourcesFor(before), store = versionedBlobStore()
  const repository = createAssistantActionRepository({ store, householdId: 'practice-tests', now: () => instant })
  const data = withPracticeCheckin(before, readPracticeRoutine(routine()), 'blocked', 'A source needs review', 'Larry will review the missing source before the next purchase')
  const proposal = await captureExpectedVersions(proposalFor(before, data, 'journal-practice'), resources)
  await repository.saveProposal(proposal)
  const completed = await executeActionWithJournal({ repository, proposal, operations: proposal.operations, session, permissions: defaultActionPermissions('admin'), resources, event: {}, leaseMs: 0, now: () => instant })
  assert.equal(resources.writes, 1)
  assert.equal(completed.audit.actor, 'Larry')
  assert.equal(resources.value.household.practiceDay.checkins[0].status, 'blocked')
  assert.equal((await repository.history()).filter(item => item.id === completed.audit.id).length, 1)
  const undone = await undoActionWithJournal({ repository, auditId: completed.audit.id, session, resources, event: {}, leaseMs: 0, now: () => instant })
  assert.equal(undone.audit.action, 'undo')
  assert.deepEqual(resources.value.household.practiceDay, before.household.practiceDay)
  assert.deepEqual(resources.value.finance, before.finance)
  assert.equal((await repository.getAudit(completed.audit.id)).undoAvailable, false)
})

test('native Schedule and Family Calendar never project a practice before its effective date', () => {
  const schedule = normalizeHouseholdScheduleState({ routines: [routine()] })
  assert.equal(routineOccurrencesForDate(schedule, '2026-09-20').length, 0)
  assert.equal(routineOccurrencesForDate(schedule, date).length, 1)
  const events = householdScheduleCalendarEvents(schedule, { start: '2026-09-20', days: 3 })
  assert.deepEqual(events.map(event => event.date), [date, '2026-09-22'])
})

test('one-date owner and timing overrides are displayed and recorded without changing the agreement', () => {
  const standing = routine(), before = initialPlan()
  const schedule = normalizeHouseholdScheduleState({ routines: [standing], routineOverrides: { [`${standing.id}:${date}`]: { owner: 'Lorenzo', startTime: '07:00', endTime: '07:15' } } })
  const card = dailyPracticeCards(schedule, before)[0]
  assert.equal(card.practice.routine.owner, 'Larry')
  assert.equal(card.effectivePractice.routine.owner, 'Lorenzo')
  assert.equal(card.effectivePractice.routine.startTime, '07:00')
  const data = withPracticeCheckin(before, card.effectivePractice, 'complete')
  assert.equal(data.checkins[0].owner, 'Lorenzo')
})

test('a new coverage owner does not inherit another person’s completion on the same date', () => {
  const standing = routine(), before = initialPlan()
  before.household.practiceDay = withPracticeCheckin(before, readPracticeRoutine(standing), 'complete')
  const schedule = normalizeHouseholdScheduleState({ routines: [standing], routineOverrides: { [`standing-unused:${date}`]: {}, [`${standing.id}:${date}`]: { owner: 'Lorenzo' } } })
  const card = dailyPracticeCards(schedule, before)[0]
  assert.equal(card.state, 'unrecorded')
  assert.equal(card.checkin.owner, 'Larry')
})

test('weekly summaries distinguish missing dates, explicit unrecorded results and unavailable sources', () => {
  const one = initialPlan(), two = initialPlan()
  two.date = '2026-09-22'
  two.household.practiceDay = withPracticeCheckin(two, readPracticeRoutine(routine()), 'unrecorded')
  const summary = summarizePracticeWeek([{ date, plan: one }, { date: two.date, plan: two }, { date: '2026-09-23', error: 'Source unavailable' }])
  assert.equal(summary.unrecorded, 1)
  assert.deepEqual(summary.unrecordedDates, [date])
  assert.deepEqual(summary.unavailableDates, ['2026-09-23'])
  assert.equal(summary.complete, 0)
})

test('agreement revisions preserve invited participants and editors check the actual coverage owner', () => {
  const source = readFileSync(new URL('./PracticeEditors.jsx', import.meta.url), 'utf8')
  assert.match(source, /participants: practice\?\.routine\.participants \|\| \[\]/)
  assert.match(source, /card\.checkin\?\.owner === card\.practice\.routine\.owner/)
})

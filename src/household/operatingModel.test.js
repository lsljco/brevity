import assert from 'node:assert/strict'
import test from 'node:test'
import { OPERATING_KIND, buildTodayReadModel, createOperatingRecord } from './operatingModel.js'

const plan = {
  id: 'daily-plan-2026-08-26',
  date: '2026-08-26',
  theme: 'Act on what matters',
  health: { dinner: 'Salmon and asparagus' },
  fitness: { location: 'Lifetime Fitness' },
  education: { isaiah: { owner: 'Terica' } },
  topPriorities: [
    { id: 'outcome-1', title: 'Resolve the insurance decision', owner: 'Larry', status: 'pending' },
  ],
  assignments: [
    { id: 'mine', title: 'Call the doctor', owner: 'Larry', status: 'pending', priority: 'high' },
    { id: 'family', title: 'General family item', owner: 'Family', status: 'pending' },
    { id: 'done', title: 'Finished work', owner: 'Larry', status: 'complete' },
  ],
  decisions: [
    { id: 'decision-1', title: 'Choose contractor', owner: 'Larry', status: 'needs-decision' },
    { id: 'decision-2', title: 'Approved proposal', owner: 'Larry', status: 'determined' },
    { id: 'decision-3', title: 'Closed question', owner: 'Larry', status: 'complete' },
  ],
}

test('operating records require a recognized kind and a useful title', () => {
  assert.throws(() => createOperatingRecord({ kind: 'widget', title: 'Invalid' }), /unsupported/i)
  assert.throws(() => createOperatingRecord({ kind: OPERATING_KIND.action, title: ' ' }), /require a title/i)
})

test('Today read model separates outcomes, actions, decisions, commitments, and signals', () => {
  const model = buildTodayReadModel({
    plan,
    currentMember: 'Larry',
    now: new Date('2026-08-26T08:00:00'),
    calendarHealth: { state: 'ready', usable: true, stale: false, lastSuccessfulSyncAt: '2026-08-26T07:55:00.000Z' },
    calendarAppointments: [
      { id: 'doctor', title: 'Doctor appointment', date: '2026-08-26', startTime: '9:30 AM', owner: 'Larry', calendarSource: 'icloud' },
    ],
  })

  assert.deepEqual(model.outcomes.map(item => item.title), ['Resolve the insurance decision'])
  assert.deepEqual(model.actions.map(item => item.title), ['Call the doctor'])
  assert.deepEqual(model.decisions.map(item => item.title), ['Choose contractor', 'Approved proposal'])
  assert.equal(model.commitments[0].kind, OPERATING_KIND.commitment)
  assert.equal(model.commitments[0].source.system, 'apple-calendar')
  assert.equal(model.nextCommitment.title, 'Doctor appointment')
  assert.equal(model.signals.length, 0)
})

test('calendar failures become prioritized signals without hiding cached commitments', () => {
  const model = buildTodayReadModel({
    plan,
    currentMember: 'Larry',
    now: new Date('2026-08-26T08:00:00'),
    calendarHealth: { state: 'error', usable: true, stale: true, message: 'Apple rejected discovery. Cached events remain visible.', lastSuccessfulSyncAt: '2026-08-26T07:00:00.000Z' },
    calendarAppointments: [
      { id: 'doctor', title: 'Doctor appointment', date: '2026-08-26', startTime: '9:30 AM', owner: 'Larry', calendarSource: 'icloud' },
    ],
  })

  assert.equal(model.signals[0].title, 'Today’s calendar may be out of date')
  assert.equal(model.signals[0].priority, 'critical')
  assert.equal(model.commitments.length, 1)
})

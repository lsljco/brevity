import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildHouseholdMaintenanceWeek,
  householdOccurrence,
  householdOperationCalendarEvent,
  maintenanceWeekStart,
  normalizeHouseholdMaintenanceState,
  summarizeHouseholdMaintenance,
} from './householdMaintenanceData.js'

test('household operations follow the authoritative weekly cleaning cadence', () => {
  const days = buildHouseholdMaintenanceWeek('2026-08-24')
  assert.equal(days.length, 7)
  assert.equal(days[0].date, '2026-08-24')
  assert.ok(days[0].tasks.some(task => task.title === 'Upstairs bathrooms + hall/landing' && task.owners.includes('Nyla')))
  assert.ok(days[0].tasks.some(task => task.title === 'Upstairs floors + stairs' && task.owners.includes('Javin')))
  assert.ok(days[1].tasks.some(task => task.title === 'Main-floor living, dining + common areas'))
  assert.ok(days[2].tasks.some(task => task.title === 'Kitchen detail'))
  assert.ok(days[3].tasks.some(task => task.title === 'Bottom-floor common areas + bathroom'))
  assert.ok(days[4].tasks.some(task => task.title === 'Pet/utility area + one missed zone'))
  assert.ok(days[5].tasks.some(task => task.title.startsWith('Rotation Week ')))
  assert.ok(days[6].tasks.some(task => task.title === 'Joint 60–90 minute household reset'))
  assert.ok(days.flatMap(day => day.tasks).every(task => task.zone && task.standard && task.signoffRequired))
})

test('household weeks begin on Monday and completion summary honors sign-off', () => {
  assert.equal(maintenanceWeekStart('2026-08-29').toISOString().slice(0, 10), '2026-08-24')
  const days = buildHouseholdMaintenanceWeek('2026-08-29')
  const firstTask = days[0].tasks[0]
  const state = normalizeHouseholdMaintenanceState({
    trackingStartedOn: '2026-08-24',
    occurrences: { [firstTask.occurrenceId]: { approvedAt:'2026-08-24T20:00:00.000Z', approvedBy:'Larry', complete:true } },
  })
  const summary = summarizeHouseholdMaintenance(days, state, '2026-08-29')
  assert.equal(summary.scheduled, 13)
  assert.equal(summary.approved, 1)
  assert.equal(summary.dueToday, 2)
  assert.equal(summary.overdue, 9)
})

test('work scheduled before operations tracking began is not falsely marked overdue', () => {
  const days = buildHouseholdMaintenanceWeek('2026-08-29')
  const state = normalizeHouseholdMaintenanceState({ trackingStartedOn: '2026-08-29', occurrences: {} })
  const summary = summarizeHouseholdMaintenance(days, state, '2026-08-29')
  assert.equal(summary.overdue, 0)
})

test('legacy completion records migrate into the current occurrence state shape', () => {
  const state = normalizeHouseholdMaintenanceState({ trackingStartedOn:'2026-09-01', completions:{ '2026-09-03:thursday-nyla-basement':{ complete:true, completedBy:'Nyla' } } })
  assert.equal(state.version, 4)
  assert.equal(state.occurrences['2026-09-03:thursday-nyla-basement'].complete, true)
})

test('coverage applies to one recurring occurrence without changing another week', () => {
  const firstWeek = buildHouseholdMaintenanceWeek('2026-08-31')
  const secondWeek = buildHouseholdMaintenanceWeek('2026-09-07')
  const firstSaturday = firstWeek[5].tasks.find(item => item.id === 'saturday-nyla-light-reset')
  const secondSaturday = secondWeek[5].tasks.find(item => item.id === 'saturday-nyla-light-reset')
  const state = normalizeHouseholdMaintenanceState({ occurrences:{ [firstSaturday.occurrenceId]:{ coveredBy:'Larry' } } })
  assert.equal(householdOccurrence(state, firstSaturday).coveredBy, 'Larry')
  assert.equal(householdOccurrence(state, secondSaturday).coveredBy, undefined)
})

test('joint Sunday reset publishes one shared Family Calendar event', () => {
  const week = buildHouseholdMaintenanceWeek('2026-08-31')
  const sharedTask = week[6].tasks.find(item => item.id === 'sunday-joint-reset')
  const event = householdOperationCalendarEvent(sharedTask)
  assert.deepEqual(event.members, ['Javin','Nyla'])
  assert.equal(event.owner, 'Family')
  assert.equal(event.source, 'household-operations')
})

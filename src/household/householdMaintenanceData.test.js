import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHouseholdMaintenanceWeek, maintenanceWeekStart, summarizeHouseholdMaintenance } from './householdMaintenanceData.js'

test('household maintenance follows the PDF weekly cadence and named ownership', () => {
  const days = buildHouseholdMaintenanceWeek('2026-08-24')
  assert.equal(days.length, 7)
  assert.equal(days[0].date, '2026-08-24')
  assert.ok(days[0].tasks.some(task => task.title === 'Clean 3 upstairs balconies'))
  assert.ok(days[1].tasks.some(task => task.title === 'Clean 2 main-floor balconies'))
  assert.ok(days[2].tasks.some(task => task.title === 'Complete the top floor' && task.timing === '12-4 PM'))
  assert.ok(days[3].tasks.some(task => task.title === 'Bathe Caesar and Adonis'))
  assert.ok(days[4].tasks.some(task => task.title === 'Complete the bottom floor'))
  assert.ok(days[2].tasks.some(task => task.owners.includes('Isaiah') && task.timing === 'After 2 PM'))
  assert.ok(days.every(day => day.tasks.some(task => task.id === 'daily-kitchen-reset')))
  assert.ok(days.every(day => day.tasks.some(task => task.id === 'daily-bedroom-reset')))
})

test('household maintenance weeks begin on Monday and completion summary identifies overdue work', () => {
  assert.equal(maintenanceWeekStart('2026-08-29').toISOString().slice(0, 10), '2026-08-24')
  const days = buildHouseholdMaintenanceWeek('2026-08-29')
  const firstTask = days[0].tasks[0]
  const summary = summarizeHouseholdMaintenance(days, { trackingStartedOn: '2026-08-24', completions: { [firstTask.occurrenceId]: { complete: true } } }, '2026-08-29')
  assert.equal(summary.scheduled, 25)
  assert.equal(summary.completed, 1)
  assert.equal(summary.dueToday, 2)
  assert.equal(summary.overdue, 20)
})

test('work scheduled before maintenance tracking began is not falsely marked overdue', () => {
  const days = buildHouseholdMaintenanceWeek('2026-08-29')
  const summary = summarizeHouseholdMaintenance(days, { trackingStartedOn: '2026-08-29', completions: {} }, '2026-08-29')
  assert.equal(summary.overdue, 0)
})

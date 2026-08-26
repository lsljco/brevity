import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarAppointmentsForPlan, mergeCalendarEventsIntoPlan } from '../family/calendarOverlay.js'

const plan = {
  date: '2026-08-26',
  household: {
    appointments: [{ id:'brevity-doctor', title:'Doctor appointment', date:'2026-08-26', startTime:'10:30 AM', owner:'Larry' }],
  },
}

test('Today includes Apple calendar events scheduled for the plan date', () => {
  const appointments = calendarAppointmentsForPlan(plan, [
    { id:'icloud-dentist', title:'Dentist appointment', date:'2026-08-26', time:'2:00 PM', owner:'Larry' },
    { id:'icloud-tomorrow', title:'Tomorrow event', date:'2026-08-27', time:'9:00 AM' },
  ])

  assert.deepEqual(appointments.map(item => item.title), ['Doctor appointment', 'Dentist appointment'])
  assert.equal(appointments[1].calendarSource, 'icloud')
  assert.equal(appointments[1].readOnly, true)
})

test('Today does not duplicate Brevity appointments already published to Apple', () => {
  const appointments = calendarAppointmentsForPlan(plan, [
    { id:'icloud-copy', sourceId:'brevity-doctor', title:'Doctor appointment', date:'2026-08-26', time:'10:30 AM' },
    { id:'icloud-copy-without-source', title:'Doctor appointment', date:'2026-08-26', time:'10:30 AM' },
  ])

  assert.equal(appointments.length, 1)
  assert.equal(appointments[0].id, 'brevity-doctor')
})

test('calendar overlay is derived without mutating the saved daily plan', () => {
  const overlaid = mergeCalendarEventsIntoPlan(plan, [
    { id:'icloud-lab', title:'Lab appointment', date:'2026-08-26', time:'8:00 AM' },
  ])

  assert.equal(plan.household.appointments.length, 1)
  assert.equal(overlaid.household.appointments.length, 2)
  assert.notEqual(overlaid.household, plan.household)
})

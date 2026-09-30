import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarAppointmentsForPlan, compareCalendarEventsChronologically, dedupeCalendarEvents, mergeCalendarEventsIntoPlan } from '../family/calendarOverlay.js'

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

  assert.equal(appointments.length, 2)
  assert.equal(appointments[0].id, 'brevity-doctor')
})

test('calendar views preserve similar commitments without explicit lineage', () => {
  const events = dedupeCalendarEvents([
    { id: 'legacy', title: 'Wednesday Night Connect', date: '2026-08-26', time: '7:00 PM', owner: 'Lorenzo', source: 'brevity-legacy' },
    { id: 'apple-1', sourceId: 'daily-plan-1', title: ' Wednesday Night Connect ', date: '2026-08-26', time: '7:00 PM', owner: 'Lorenzo', source: 'icloud' },
    { id: 'apple-2', title: 'Wednesday Night Connect', date: '2026-08-26', time: '7:00 PM', owner: 'Larry', source: 'icloud' },
  ])

  assert.equal(events.length, 3)
  assert.deepEqual(events.map(event=>event.id),['legacy','apple-1','apple-2'])
})

test('calendar overlay is derived without mutating the saved daily plan', () => {
  const overlaid = mergeCalendarEventsIntoPlan(plan, [
    { id:'icloud-lab', title:'Lab appointment', date:'2026-08-26', time:'8:00 AM' },
  ])

  assert.equal(plan.household.appointments.length, 1)
  assert.equal(overlaid.household.appointments.length, 2)
  assert.notEqual(overlaid.household, plan.household)
})

test('calendar events sort all-day first and timed events by the actual clock', () => {
  const events = [
    {title:'Bedtime medicine',time:'8:00 PM'},
    {title:'Pick up Javin',time:'4:30 PM'},
    {title:'Principal coffee chat',time:'8:00 AM'},
    {title:'Month close',time:'9:15 AM'},
    {title:'Kitchen detail',time:'',allDay:true},
    {title:'Daily tutor',time:'2:45 PM'},
  ].sort(compareCalendarEventsChronologically)

  assert.deepEqual(events.map(event=>event.title),[
    'Kitchen detail',
    'Principal coffee chat',
    'Month close',
    'Daily tutor',
    'Pick up Javin',
    'Bedtime medicine',
  ])
})


test('calendar lineage survives renames and retains recurring occurrences and provider boundaries',()=>{
  const events=dedupeCalendarEvents([
    {id:'origin',title:'Old label',date:'2026-08-26',source:'brevity-legacy'},
    {id:'apple-copy',sourceId:'origin',title:'Renamed label',date:'2026-08-26',source:'icloud'},
    {id:'apple-next',sourceId:'recurring-origin',recurring:true,title:'Renamed label',date:'2026-08-27',source:'icloud'},
    {id:'origin',title:'Unrelated Apple record',date:'2026-08-26',source:'icloud'},
    {title:'No ID',date:'2026-08-26'},{title:'No ID',date:'2026-08-26'},
  ])
  assert.equal(events.length,5)
  assert.equal(events[0].title,'Renamed label')
  assert.equal(events[1].date,'2026-08-27')
})

test('daily overlay follows saved explicit provider links despite changed title and time',()=>{
  const linked={date:plan.date,household:{appointments:[{id:'saved',calendarEventId:'apple-id',calendarSource:'icloud',title:'Old',date:plan.date}]}}
  const result=calendarAppointmentsForPlan(linked,[{id:'apple-id',source:'icloud',title:'New',date:plan.date,time:'3:00 PM'}])
  assert.equal(result.length,1)
})

test('project windows appear on intermediate days without mutating their authoritative project',()=>{
  const event={id:'project-kitchen',sourceId:'project-kitchen',projectId:'kitchen',source:'project',title:'Kitchen',date:'2026-08-25',endDate:'2026-08-28',allDay:true}
  const result=calendarAppointmentsForPlan({date:'2026-08-26',household:{appointments:[]}},[event])
  assert.equal(result.length,1)
  assert.equal(result[0].projectId,'kitchen')
  assert.equal(result[0].calendarSource,'project')
  assert.equal(result[0].readOnly,true)
})

test('daily-plan publication lineage reconnects by exact plan and item IDs after a label changes',()=>{
  const saved={date:plan.date,household:{appointments:[{id:'visit',title:'Old appointment',date:plan.date,calendarSync:true}]}}
  const appointments=calendarAppointmentsForPlan(saved,[{id:'apple-copy',sourceId:`assistant-daily-${plan.date}-visit`,source:'icloud',title:'Renamed appointment',date:plan.date,time:'3:00 PM'}])
  assert.equal(appointments.length,1)
  assert.equal(appointments[0].id,'visit')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { FINANCE_MEETINGS_KEY, isLegacyMeetingCalendarCopy, meetingActionsCalendarEvents } from './meetingCalendar.js'

function storageWith(value){return{getItem:key=>key===FINANCE_MEETINGS_KEY?JSON.stringify(value):null}}

test('Family Calendar derives Finance Meeting commitments from one authoritative record',()=>{
  const events=meetingActionsCalendarEvents(storageWith({openActions:[{
    id:'action-1',text:'Javin sends payment dates',owner:'Javin',due:'2026-09-10',meetingDate:'2026-09-07',status:'open',createdAt:'2026-09-07T13:00:00.000Z',
  },{
    id:'action-done',text:'Already finished',owner:'Javin',due:'2026-09-09',meetingDate:'2026-09-07',status:'done',createdAt:'2026-09-07T12:00:00.000Z',
  }]}))
  assert.equal(events.length,1)
  assert.deepEqual(events[0],{
    id:'finance-action-action-1',sourceId:'finance-action-action-1',source:'finance-meeting',title:'Javin sends payment dates',date:'2026-09-10',start:'2026-09-10',end:'2026-09-10',allDay:true,owner:'Javin',members:['Javin'],participants:['Javin'],calendarName:'Family',calendarSyncEnabled:false,status:'open',priority:'normal',notes:'Derived from the authoritative Finance Meeting commitment.',updatedAt:'2026-09-07T13:00:00.000Z',
  })
})

test('stale duplicated Finance Meeting calendar copies are identifiable and malformed meeting data fails closed',()=>{
  assert.equal(isLegacyMeetingCalendarCopy({source:'finance-meeting'}),true)
  assert.equal(isLegacyMeetingCalendarCopy({id:'finance-action-old'}),true)
  assert.equal(isLegacyMeetingCalendarCopy({id:'other-event'}),false)
  assert.deepEqual(meetingActionsCalendarEvents({getItem:()=>'{broken'}),[])
})

test('Family Calendar ignores old copied entries and listens to authoritative Finance Meeting updates',()=>{
  const source=readFileSync(new URL('../family/FamilyCalendar.jsx',import.meta.url),'utf8')
  assert.match(source,/readJson\(localStorage,FAMILY_CALENDAR_KEY,\[\]\)\.filter\(event=>/)
  assert.match(source,/!isLegacyMeetingCalendarCopy\(event\)/)
  assert.match(source,/!isHouseholdScheduleCalendarCopy\(event\)/)
  assert.match(source,/!isHouseholdOperationCalendarCopy\(event\)/)
  assert.match(source,/const \[meetingEvents,setMeetingEvents\]=useState\(readMeetingEvents\)/)
  assert.match(source,/const derivedKeys=\[FAMILY_CALENDAR_KEY,FINANCE_MEETINGS_KEY,HOUSEHOLD_SCHEDULE_STORAGE_KEY,HOUSEHOLD_MAINTENANCE_STORAGE_KEY\]/)
  assert.match(source,/derivedKeys\.some\(key=>keys\.includes\(key\)\)/)
  assert.match(source,/\.\.\.meetingEvents,\.\.\.householdDerivedEvents,\.\.\.icloudEvents/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canEditBrevityCalendarEvent,
  calendarEventVersion,
  calendarPermissionForActionMode,
  calendarTimeInputValue,
  canonicalizeBrevityCalendarEvent,
  isBrevityManagedAppleEvent,
} from './calendarRecords.js'

test('known transcription errors are corrected only in Brevity calendar records', () => {
  const brevity = canonicalizeBrevityCalendarEvent({
    id:'brevity-1', source:'finance-meeting', title:'Jabin will meet Tara and Tarrica', date:'2026-09-08',
    owner:'Tarrica', participants:['Jabin','Tara'], members:['Tarrica'],
  })
  const apple = {
    id:'apple-1', source:'icloud', title:'Tara family reunion', date:'2026-09-08', owner:'Tara', participants:['Jabin'],
  }

  assert.equal(brevity.title,'Javin will meet Terica and Terica')
  assert.equal(brevity.owner,'Terica')
  assert.deepEqual(brevity.participants,['Javin','Terica'])
  assert.equal(canonicalizeBrevityCalendarEvent(apple),apple)
  assert.equal(apple.title,'Tara family reunion')
  assert.equal(apple.owner,'Tara')
})

test('only Action Mode-created Apple records are directly editable', () => {
  assert.equal(isBrevityManagedAppleEvent({source:'icloud',sourceId:'assistant-calendar-op'}),true)
  assert.equal(isBrevityManagedAppleEvent({source:'icloud',sourceId:'assistant-calendar-op',id:'event::20260908'}),false)
  assert.equal(isBrevityManagedAppleEvent({source:'icloud',sourceId:'daily-2026-09-07-task'}),false)
  assert.equal(isBrevityManagedAppleEvent({source:'icloud',sourceId:''}),false)
  assert.equal(isBrevityManagedAppleEvent({source:'finance-meeting',sourceId:'assistant-calendar-op'}),false)
})

test('calendar edits require a real record version and never use href as a version token', () => {
  const base={source:'icloud',sourceId:'assistant-calendar-op',owner:'Family'}
  const access={allowed:true,role:'admin',member:'Larry'}
  assert.equal(calendarEventVersion({...base,href:'/calendar/event.ics'}),'')
  assert.equal(canEditBrevityCalendarEvent({...base,href:'/calendar/event.ics'},access),false)
  assert.equal(calendarEventVersion({...base,etag:'"calendar-v2"'}),'"calendar-v2"')
  assert.equal(canEditBrevityCalendarEvent({...base,etag:'"calendar-v2"'},access),true)
})

test('Apple locale times hydrate HTML time inputs without changing all-day events', () => {
  assert.equal(calendarTimeInputValue('7:30 PM'),'19:30')
  assert.equal(calendarTimeInputValue('12:05 AM'),'00:05')
  assert.equal(calendarTimeInputValue('08:45'),'08:45')
  assert.equal(calendarTimeInputValue('8:45:00'), '08:45')
  assert.equal(calendarTimeInputValue('All day'),'')
})

test('member ownership restrictions match the server-side calendar boundary', () => {
  const event={source:'icloud',sourceId:'assistant-calendar-op',etag:'"calendar-v1"',owner:'Lorenzo',participants:['Nyla']}
  assert.equal(canEditBrevityCalendarEvent(event,{allowed:true,role:'admin',member:'Larry'}),true)
  assert.equal(canEditBrevityCalendarEvent(event,{allowed:true,role:'member',member:'Nyla'}),true)
  assert.equal(canEditBrevityCalendarEvent(event,{allowed:true,role:'member',member:'Javin'}),false)
  assert.equal(canEditBrevityCalendarEvent({...event,owner:'Family'},{allowed:true,role:'member',member:'Javin'}),true)
  assert.equal(canEditBrevityCalendarEvent(event,{allowed:false,role:'admin',member:'Larry'}),false)
})

test('Family Calendar controls follow authenticated Action Mode permissions', () => {
  assert.deepEqual(calendarPermissionForActionMode({member:'Larry',role:'admin',permissions:{Larry:{calendar:false}}}),{allowed:true,member:'Larry',reason:''})
  assert.deepEqual(calendarPermissionForActionMode({member:'Nyla',role:'member',permissions:{Nyla:{calendar:true}}}),{allowed:true,member:'Nyla',reason:''})
  assert.equal(calendarPermissionForActionMode({member:'Nyla',role:'member',permissions:{Nyla:{calendar:false}}}).allowed,false)
  assert.equal(calendarPermissionForActionMode({}).allowed,false)
})

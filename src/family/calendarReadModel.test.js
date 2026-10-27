import test from 'node:test'
import assert from 'node:assert/strict'
import {combineCalendarRecords,familyCalendarDay} from './calendarReadModel.js'

test('Family day keeps every source-calendar event regardless of responsibility, time, or multi-day start',()=>{
 const date='2026-10-27'
 const events=Array.from({length:8},(_,i)=>({id:`family-${i}`,title:`Family entry ${i}`,source:'icloud',appleCalendarOwner:'Family',owner:'Terica',date,time:i===0?'':'09:00',allDay:i===0}))
 events.push({id:'overnight',title:'Family trip',source:'icloud',appleCalendarOwner:'Family',owner:'Lorenzo',date:'2026-10-26',endDate:'2026-10-28',allDay:true})
 events.push({id:'personal',title:'Personal',source:'icloud',appleCalendarOwner:'Larry',owner:'Larry',date})
 events.push({id:'tomorrow',title:'Tomorrow',source:'icloud',appleCalendarOwner:'Family',date:'2026-10-28'})
 const result=familyCalendarDay(events,date)
 assert.equal(result.length,9)
 assert.ok(result.some(x=>x.id==='overnight'))
 assert.ok(result.some(x=>x.id==='family-7'))
 assert.ok(!result.some(x=>['personal','tomorrow'].includes(x.id)))
})
test('same source records deduplicate; distinct calendar events with identical titles remain',()=>{
 const base={title:'Meeting',date:'2026-10-27',owner:'Family'}
 const result=combineCalendarRecords({legacyEvents:[{...base,id:'local'}],icloudEvents:[{...base,id:'apple',source:'icloud',sourceId:'local'},{...base,id:'other',source:'icloud'}],meetingEvents:[{...base,id:'finance'}]})
 assert.deepEqual(result.map(x=>x.id),['finance','apple','other'])
})

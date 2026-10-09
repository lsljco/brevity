import test from 'node:test'
import assert from 'node:assert/strict'
import {todayCalendarAppointments} from './todayCalendar.js'
import {buildDailyAgenda} from './dailyAgenda.js'
const events=[
 {id:'family',source:'icloud',appleCalendarId:'f',appleCalendarOwner:'Family',owner:'Terica',title:'Family dinner'},
 {id:'larry',source:'icloud',appleCalendarId:'l',appleCalendarOwner:'Larry',owner:'Family',title:'Interview'},
 {id:'terica',source:'icloud',appleCalendarId:'t',appleCalendarOwner:'Terica',owner:'Family',participants:['Larry'],title:'TS call'},
 {id:'nyla',owner:'Nyla',title:'Shift'},
 {id:'shared',owner:'Family',title:'Groceries'},
 {id:'unknown',source:'icloud',owner:'Family',title:'Unmapped event'},
 {id:'uncertain',owner:'Family',ownershipKnown:false,title:'Unknown owner'},
]
test('Today shows Family and the signed-in calendar using Apple source ownership',()=>{
 assert.deepEqual(todayCalendarAppointments(events,'Larry').map(x=>x.id),['family','larry','shared'])
 assert.deepEqual(todayCalendarAppointments(events,'Terica').map(x=>x.id),['family','terica','shared'])
 assert.deepEqual(todayCalendarAppointments(events,'Nyla').map(x=>x.id),['family','nyla','shared'])
})
test('Household means Family calendar, never every personal calendar',()=>{
 assert.deepEqual(todayCalendarAppointments(events,'Larry','household').map(x=>x.id),['family','shared'])
})
test('agenda retains shared Apple events despite a personal organizer and excludes another source despite Family owner',()=>{
 for(const scope of ['mine','household']){
 const result=buildDailyAgenda({plan:{date:'2026-10-09'},appointments:events,member:'Larry',scope})
 assert.ok(result.items.some(x=>x.id==='family'));assert.ok(!result.items.some(x=>x.id==='terica'))
 }
})
test('agreed dated tasks remain priorities; calendar events never become priorities',()=>{
 const plan={date:'2026-10-09',assignments:[{id:'a',title:'Vacuum',owner:'Nyla'},{id:'b',title:'Done',status:'completed'},{id:'c',title:'Cancelled',cancelled:true}]}
 const result=buildDailyAgenda({plan,appointments:events,member:'Larry'})
 assert.deepEqual(result.priorities.map(x=>x.id),['a']);assert.ok(!result.pending.some(x=>x.id==='a'))
})
test('explicit Brevity participants remain visible without changing full calendar data',()=>{
 const records=[{id:'trip',owner:'Lorenzo',participants:['Larry']}],before=structuredClone(records)
 assert.equal(todayCalendarAppointments(records,'Larry').length,1)
 assert.equal(todayCalendarAppointments(records,'Terica').length,0)
 assert.deepEqual(records,before)
})
test('saved top priorities lead ahead of routine assignments and calendar times',()=>{
 const plan={date:'2026-10-09',topPriorities:[{id:'focus',title:'Submit applications',owner:'Larry'}],assignments:[{id:'routine',title:'Daily standards',owner:'Larry',startTime:'08:00'}]}
 const result=buildDailyAgenda({plan,appointments:events,member:'Larry'})
 assert.deepEqual(result.priorities.map(x=>x.id),['focus'])
})

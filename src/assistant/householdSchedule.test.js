import test from 'node:test'
import assert from 'node:assert/strict'
import {householdSchedule,compactAssistantCalendar} from '../../netlify/lib/household-schedule.mjs'
const context=()=>({householdDate:'2026-09-29',signedInMember:'Larry',sources:[{id:'shared-action-records',state:'available'},{id:'daily-plan',state:'available'}],supplementalSources:{'apple-calendar':'available'},appleFamilyCalendar:{events:[{id:'a',title:'Shared appointment',date:'2026-09-29',time:'09:00',owner:'Family'},{id:'b',title:'Personal appointment',date:'2026-09-29',time:'14:00',participants:['Larry']},{id:'c',title:'Other appointment',date:'2026-09-29',time:'12:00',owner:'Lorenzo'}]},actionRecords:{familyCalendarEvents:[{id:'local',title:'Local appointment',date:'2026-09-29',time:'08:00',owner:'Larry'}]},dailyPlan:{assignments:[{id:'task',title:'Call plumber',owner:'Larry'}]}})
test('schedule joins calendar sources in time order without assigning shared events to the signed-in member',()=>{const result=householdSchedule(context());assert.deepEqual(result.events.map(e=>e.id),['local','a','c','b']);assert.deepEqual(result.personalAppointments.map(e=>e.id),['local','b']);assert.deepEqual(result.sharedAppointments.map(e=>e.id),['a']);assert.deepEqual(result.otherMemberAppointments.map(e=>e.id),['c']);assert.equal(result.assignments[0].id,'task')})
test('calendar outage does not erase available calendar or imply an empty complete schedule',()=>{const c=context();c.supplementalSources['apple-calendar']='unavailable';const result=householdSchedule(c);assert.equal(result.events.length,1);assert.equal(result.sources.appleCalendar,'unavailable')})
test('tomorrow and multi-day events use household dates, not UTC rollover or yesterday tasks',()=>{const c=context();c.appleFamilyCalendar.events.push({id:'span',title:'Trip',date:'2026-09-29',endDate:'2026-10-01',allDay:true});const result=householdSchedule(c,'tomorrow');assert.equal(result.date,'2026-09-30');assert.deepEqual(result.events.map(e=>e.id),['span']);assert.deepEqual(result.assignments,[]);assert.equal(result.sources.dailyPlan,'not-loaded')})
test('keeps distinct same-title events and rejects invalid dates',()=>{const c=context();c.appleFamilyCalendar.events.push({...c.appleFamilyCalendar.events[0],id:'distinct'});assert.equal(householdSchedule(c).events.length,5);assert.throws(()=>householdSchedule(c,'2026-02-30'));assert.throws(()=>householdSchedule(c,'next someday'))})

test('today remains discoverable after more than 300 older calendar occurrences',()=>{const c=context();const older=Array.from({length:500},(_,i)=>({id:`old-${i}`,title:'Old event',date:'2026-06-01'}));c.appleFamilyCalendar=compactAssistantCalendar({events:[...older,...c.appleFamilyCalendar.events]});assert.equal(c.appleFamilyCalendar.events.length,503);assert.deepEqual(householdSchedule(c).personalAppointments.map(e=>e.id),['local','b'])})

test('authoritative Brevity calendar retains late records without exposing sensitive fields',async()=>{
 const {buildAuthoritativeAssistantContext}=await import('../../netlify/lib/assistant-authoritative-context.mjs')
 const events=Array.from({length:400},(_,i)=>({id:`event-${i}`,title:'Appointment',date:i===399?'2026-09-29':'2026-06-01',owner:'Larry',apiKey:'must-not-appear'}))
 const c=await buildAuthoritativeAssistantContext({member:'Larry',date:'2026-09-29',loadDailyPlan:async()=>null,loadMealWindow:async()=>null,loadActiveSermon:async()=>null,loadSharedRecords:async()=>({family_calendar_events_v1:{value:JSON.stringify(events)}})})
 assert.equal(c.actionRecords.familyCalendarEvents.length,400)
 assert.equal(householdSchedule(c).events[0].id,'event-399')
 assert.equal(JSON.stringify(c).includes('must-not-appear'),false)
})

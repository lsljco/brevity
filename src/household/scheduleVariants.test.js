import test from 'node:test'
import assert from 'node:assert/strict'
import {variantForWakeTime,scheduleReferenceFor,scheduleVariantFor} from './scheduleVariants.js'
import {householdSchedule} from '../../netlify/lib/household-schedule.mjs'

test('wake-window boundaries select A–D without guessing absent or invalid times',()=>{
 for(const [time,want] of [['04:24','A'],['04:25','B'],['04:44','B'],['04:45','C'],['05:14','C'],['05:15','D'],['5:15 AM','D'],['',''],['25:00',''],['4:99','']])assert.equal(variantForWakeTime(time),want||null)
})
test('references cover both groups, preserve source identity and expose missing times',()=>{
 for(const member of ['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah'])for(const variant of ['A','B','C','D']){
  const result=scheduleVariantFor(member,variant)
  assert.ok(result.items.length>=7)
  assert.ok(result.items.every(item=>item.owner===member&&item.source.startsWith(`schedule-${variant.toLowerCase()}:${member}:`)))
  assert.equal(new Set(result.items.map(x=>x.source)).size,result.items.length)
 }
 assert.equal(scheduleVariantFor('Larry','B').items[3].startTime,'05:08')
 assert.equal(scheduleVariantFor('Terica','C').items[2].startTime,'05:15')
 assert.ok(scheduleVariantFor('Larry','D').needsClarification.some(x=>x.includes('Shower')))
 assert.equal(scheduleVariantFor('Unknown','A').items.length,0)
})
test('saved sources and explicit wake times select a reference without modifying assignments',()=>{
 const assignments=[{id:'one',owner:'Larry',source:'schedule-b:Larry:stage-1',startTime:'04:40',status:'pending'},{owner:'Terica',source:'schedule-a:Terica:04:00'}],copy=structuredClone(assignments)
 assert.equal(scheduleReferenceFor('Larry',{assignments}).selectedVariant,'B')
 const changed=scheduleReferenceFor('Larry',{assignments,wakeTime:'05:40'})
 assert.equal(changed.selectedVariant,'D');assert.ok(changed.needsClarification.some(x=>x.includes('before the reported wake')))
 assert.ok(scheduleReferenceFor('Larry',{wakeTime:'05:15',variant:'A'}).needsClarification.some(x=>x.includes('differs')))
 assert.equal(scheduleReferenceFor('Larry').selectedVariant,null)
 assert.deepEqual(assignments,copy)
})
test('schedule reader returns reference for target date without implying an unloaded plan is empty',()=>{
 const canonical={householdDate:'2026-10-09',signedInMember:'Larry',dailyPlan:{assignments:[{owner:'Larry',source:'schedule-b:Larry:stage-1'}]},sources:[],supplementalSources:{}}
 const before=structuredClone(canonical)
 const tomorrow=householdSchedule(canonical,'tomorrow',{wakeTime:'04:50'})
 assert.equal(tomorrow.date,'2026-10-10');assert.equal(tomorrow.scheduleReference.selectedVariant,'C')
 assert.equal(tomorrow.sources.dailyPlan,'not-loaded');assert.equal(tomorrow.timeBlocks.length,0)
 assert.deepEqual(canonical,before)
})

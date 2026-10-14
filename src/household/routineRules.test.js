import test from 'node:test'
import assert from 'node:assert/strict'
import {parseRoutineTiming,validateRoutineTiming} from './routineRules.js'
import {routineOccurrencesForDate} from './householdScheduleData.js'
import {applyHouseholdRecordOperation} from './householdActionModel.js'
import {normalizeActionOperation,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {scheduleReferenceFor} from './scheduleVariants.js'
const day='2026-10-14'
const work={id:'work',title:'Work',owner:'Javin',days:[1,2,3,4,5],enabled:true,startTime:'09:00',endTime:'17:00'}
const close={id:'close',title:'Closeout',owner:'Javin',days:[1,2,3,4,5],enabled:true,startTime:'17:00',endTime:'17:30',timingRuleJson:JSON.stringify({anchorId:'work',offsetMinutes:15,durationMinutes:30})}
const state=()=>({routines:[work,close],blocks:[],routineOverrides:{}})
test('relative routines follow exact source IDs and dated changes, without modifying the next day',()=>{
 const s=state();s.routineOverrides['work:'+day]={startTime:'10:00',endTime:'18:00'}
 assert.equal(routineOccurrencesForDate(s,day).find(x=>x.routineId==='close').startTime,'18:15')
 assert.equal(routineOccurrencesForDate(s,'2026-10-15').find(x=>x.routineId==='close').startTime,'17:15')
 s.routineOverrides['close:'+day]={startTime:'19:00',endTime:'19:30'}
 assert.equal(routineOccurrencesForDate(s,day).find(x=>x.routineId==='close').startTime,'19:00')
})
test('missing or cancelled anchors produce a question instead of invented timing',()=>{
 const s=state();s.routineOverrides['work:'+day]={cancelled:true}
 const item=routineOccurrencesForDate(s,day).find(x=>x.routineId==='close')
 assert.ok(item.timingIssue);assert.equal(item.startTime,'');assert.equal(item.endTime,'')
})
test('relative rules reject cycles, unrelated members and invalid duration',()=>{
 assert.throws(()=>parseRoutineTiming({anchorId:'work',offsetMinutes:0,durationMinutes:0}))
 assert.throws(()=>validateRoutineTiming({...work,timingRuleJson:JSON.stringify({anchorId:'close',offsetMinutes:0,durationMinutes:30})},[work,close]),/loop/)
 assert.throws(()=>validateRoutineTiming({...close,owner:'Nyla'},[work]),/same member/)
})
test('routine timing survives action normalization and persistence',()=>{
 const op=normalizeActionOperation({type:'household.schedule.routine.create',targetDate:day,payload:{...Object.fromEntries(['title','owner','days','startTime','endTime','enabled','timingRuleJson'].map(k=>[k,close[k]]))}})
 const result=applyHouseholdRecordOperation({...state(),routines:[work]},op,{actor:'Javin',createId:()=> 'new-close'})
 assert.equal(result.after.routines[1].timingRuleJson,close.timingRuleJson)
})
test('saved morning routine is a default, while explicit wake input can select a one-day alternative',()=>{
 const routines=[{owner:'Larry',enabled:true,notes:'[schedule-reference:A:Larry] Morning'}]
 assert.equal(scheduleReferenceFor('Larry',{routines}).selectedVariant,'A')
 assert.equal(scheduleReferenceFor('Larry',{routines,wakeTime:'04:50'}).selectedVariant,'C')
})

test('personal routine edits are allowed without household planning access, but cannot affect another owner',()=>{
 const operation=normalizeActionOperation({type:'household.schedule.routine.update',targetId:'work',targetDate:day,payload:{startTime:'10:00',endTime:'18:00'}})
 const context={operation,member:'Javin',role:'member',permissions:{planning:false},currentRecord:work}
 assert.equal(permissionForOperation(context).allowed,true)
 assert.equal(permissionForOperation({...context,member:'Nyla'}).allowed,false)
 assert.equal(permissionForOperation({...context,member:'Larry',role:'admin'}).allowed,true)
 assert.equal(permissionForOperation({...context,operation:{...operation,payload:{owner:'Larry'}}}).allowed,false)
})
test('restore removes only the selected day override and resumes relative timing',()=>{
 const s=state();s.routineOverrides['close:'+day]={startTime:'19:00',endTime:'19:30'};s.routineOverrides['close:2026-10-15']={cancelled:true}
 const operation=normalizeActionOperation({type:'household.schedule.occurrence.update',targetId:'close',targetDate:day,payload:{date:day,reset:true}})
 const after=applyHouseholdRecordOperation(s,operation,{actor:'Javin'}).after
 assert.equal(routineOccurrencesForDate(after,day).find(x=>x.routineId==='close').startTime,'17:15')
 assert.deepEqual(after.routineOverrides['close:2026-10-15'],{cancelled:true})
})

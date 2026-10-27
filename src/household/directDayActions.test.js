import test from 'node:test'
import assert from 'node:assert/strict'
import {dayItemChange,canUpdateDayItem,createDaySave} from './directDayActions.js'
import {createEmptyDailyPlan} from './dailyPlan.js'
import {openWorkForDate} from './openWork.js'
const plan=()=>({...createEmptyDailyPlan('2026-10-26'),version:7,assignments:[{id:'a',title:'Prepare questions',owner:'Larry',status:'pending',notes:'Keep this'}],topPriorities:[{id:'p',title:'Agree learning supports',status:'pending',owner:'Family'}]})
test('direct completion changes only the exact assignment status',()=>{
 const p=plan(),r=dayItemChange(p,{...p.assignments[0],sourceKind:'assignment'},{status:'complete'})
 assert.equal(r.expectedVersion,7);assert.deepEqual(r.operation.payload,{status:'complete'});assert.equal(r.operation.targetId,'a');assert.equal(p.assignments[0].status,'pending')
})
test('outcome completion preserves other records and does not complete linked work',()=>{
 const p=plan(),r=dayItemChange(p,{...p.topPriorities[0],sourceKind:'priority'},{status:'complete'})
 assert.equal(r.operation.payload.patch.priorities[0].id,'p');assert.equal(r.operation.payload.patch.priorities[0].status,'complete');assert.equal(p.assignments[0].status,'pending')
})
test('rescheduling a carried task changes its original source with the original version',()=>{
 const p=plan(),item=openWorkForDate({plans:[p],date:'2026-10-27'}).find(x=>x.source.kind==='assignment')
 const r=dayItemChange({...p,date:'2026-10-27'},{...item,id:item.source.id,sourceKind:'assignment',sourceDate:p.date},{date:'2026-10-28'})
 assert.equal(r.operation.targetDate,'2026-10-26');assert.equal(r.operation.targetId,'a');assert.deepEqual(r.operation.payload,{date:'2026-10-28'});assert.equal(r.expectedVersion,7)
})
test('chores projects calendars and grouped records cannot bypass their source approval',()=>{
 for(const sourceKind of ['chore','project','routine','appointment','signoff'])assert.equal(canUpdateDayItem({id:'a',sourceKind}),false)
 assert.equal(canUpdateDayItem({id:'a',sourceKind:'assignment',sourceRecords:[{},{}]}),false)
 assert.equal(canUpdateDayItem({id:'a',sourceKind:'assignment',sourceRecords:[{}]}),true)
 assert.throws(()=>dayItemChange(plan(),{id:'x',sourceKind:'assignment'},{status:'complete'}),/changed/)
})
test('retry after a lost execute response reuses one exact proposal, without AI',async()=>{
 let prepares=0,executes=[]
 const save=createDaySave(dayItemChange(plan(),{id:'a',title:'Prepare questions',sourceKind:'assignment'},{status:'complete'}),{prepare:async()=>{prepares++;return{proposal:{id:'proposal-1',operations:[{id:'op',risk:'confirmation'}]}}},execute:async args=>{executes.push(args);if(executes.length===1)throw Error('Network lost');return{audit:{id:'audit-1'}}}})
 await assert.rejects(save,/Network lost/);assert.equal((await save()).id,'audit-1');assert.equal(prepares,1);assert.deepEqual(executes[0],executes[1]);assert.equal(executes[1].confirmed,true)
})

import {exactDayCompletion} from './dayVoiceIntent.js'
test('voice completion accepts only one exact owned task and leaves ambiguous room statements alone',()=>{
 const p=plan()
 assert.equal(exactDayCompletion('Hey Brevity, mark Prepare questions complete.',p,'Larry').id,'a')
 for(const text of ['Mark it complete','We should mark Prepare questions complete','Mark Prepare complete','Mark all tasks complete'])assert.equal(exactDayCompletion(text,p,'Larry'),null)
 assert.equal(exactDayCompletion('Mark Prepare questions complete',p,'Nyla'),null)
 assert.equal(exactDayCompletion('Mark Prepare questions complete',{...p,assignments:[...p.assignments,{...p.assignments[0],id:'another'}]},'Larry'),null)
})

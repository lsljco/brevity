import test from 'node:test'
import assert from 'node:assert/strict'
import {savedDayOutcomes,visibleDayOutcomes,outcomesOperation} from './dayOutcomes.js'
import {createEmptyDailyPlan} from './dailyPlan.js'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {buildAlignmentOperations} from './dailyPlanActionReview.js'

test('outcomes use the canonical saved list without duplicating mirrored household rows',()=>{
 const plan=createEmptyDailyPlan('2026-10-26')
 plan.topPriorities=[{id:'a',title:'Prepare interview',owner:'Larry',status:'pending'},{id:'b',title:'Review résumé',owner:'Larry',status:'complete'}]
 plan.household.priorities=plan.topPriorities
 assert.equal(savedDayOutcomes(plan).length,2)
 assert.equal(visibleDayOutcomes(plan,'Larry').length,2)
 assert.equal(visibleDayOutcomes(plan,'Terica').length,0)
 assert.equal(visibleDayOutcomes(plan,'Terica','household').length,2)
})

test('outcomes preserve explicit ordering, source IDs and scheduled dates',()=>{
 const plan=createEmptyDailyPlan('2026-10-26')
 plan.topPriorities=[{id:'first',title:'First choice',priority:'normal'},{id:'later',title:'Rescheduled',date:'2026-10-27',priority:'critical'},{id:'third',title:'Another choice',priority:'high'}]
 assert.deepEqual(visibleDayOutcomes(plan,'Larry').map(x=>x.id),['first','third'])
 assert.equal(savedDayOutcomes(plan)[1].date,'2026-10-27')
})

test('legacy focus remains editable when there are no saved outcomes',()=>{
 const plan=createEmptyDailyPlan('2026-10-26');plan.household.keyFocus='Prepare interview'
 assert.equal(savedDayOutcomes(plan)[0].title,'Prepare interview')
 const {after}=applyRecordOperation(plan,outcomesOperation(plan,savedDayOutcomes(plan)))
 assert.equal(after.household.keyFocus,'')
 assert.equal(after.topPriorities[0].title,'Prepare interview')
 assert.deepEqual(after.topPriorities,after.household.priorities)
})

test('a tomorrow outcome review updates that dated plan and its recap source atomically',()=>{
 const today=createEmptyDailyPlan('2026-10-26'),tomorrow=createEmptyDailyPlan('2026-10-27')
 const original=structuredClone(today)
 const rows=[{id:'interview',title:' Prepare interview ',owner:'Larry',status:'complete',date:tomorrow.date}]
 const operation=outcomesOperation(tomorrow,rows)
 assert.equal(operation.targetDate,tomorrow.date)
 const {after}=applyRecordOperation(tomorrow,operation)
 assert.equal(after.topPriorities[0].id,'interview')
 assert.equal(after.topPriorities[0].status,'complete')
 assert.equal(after.topPriorities[0].title,'Prepare interview')
 assert.deepEqual(after.household.priorities,after.topPriorities)
 assert.deepEqual(today,original)
 const draft={...tomorrow,household:{...tomorrow.household,...operation.payload.patch},topPriorities:operation.payload.patch.priorities}
 const ops=buildAlignmentOperations(tomorrow,draft)
 assert.equal(ops.length,1)
 assert.equal(ops[0].targetDate,tomorrow.date)
 for(const field of ['id','title','owner','status','date'])assert.equal(ops[0].payload.patch.priorities[0][field],after.topPriorities[0][field])
})

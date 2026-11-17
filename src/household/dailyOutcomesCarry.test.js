import test from 'node:test'
import assert from 'node:assert/strict'
import outcomes from '../../netlify/lib/daily-outcomes.cjs'
import { buildTodayReadModel } from './operatingModel.js'
import { buildPlanDraftOperations } from './dailyPlanActionReview.js'
import { createEmptyDailyPlan } from './dailyPlan.js'
const priorities=Array.from({length:6},(_,i)=>({id:`outcome-${i}`,title:`Outcome ${i}`,owner:'Larry',status:i===0?'complete':'pending'}))
const saved=(date,values=priorities)=>({...createEmptyDailyPlan(date),outcomesReviewed:true,topPriorities:values,household:{priorities:values}})
const fake=records=>({async *list(){yield{blobs:Object.keys(records).map(date=>({key:`h/daily-plans/${date}`}))}},async getWithMetadata(key){return{data:records[key.split('/').at(-1)]}}})
test('all outcomes including completed items carry across skipped days with identity intact',async()=>{
 const source=saved('2026-10-07');const target=await outcomes.resolveDailyOutcomes(fake({'2026-10-07':source}),'h','2026-10-12',null)
 assert.deepEqual(target.household.priorities,priorities);assert.equal(target.date,'2026-10-12');assert.equal(target.version,0)
 assert.equal(buildTodayReadModel({plan:target}).outcomes.length,6)
 assert.equal(target.outcomesInheritedFrom,'2026-10-07');assert.notEqual(target.topPriorities,source.topPriorities)
})
test('explicit changes and deliberate empty lists replace older outcomes',async()=>{
 const records={'2026-10-07':saved('2026-10-07'),'2026-10-08':saved('2026-10-08',[])}
 const target=await outcomes.resolveDailyOutcomes(fake(records),'h','2026-10-12',null)
 assert.deepEqual(target.topPriorities,[]);assert.equal(target.outcomesInheritedFrom,'2026-10-08')
 const own=saved('2026-10-12',[priorities[3]])
 assert.deepEqual((await outcomes.resolveDailyOutcomes(fake(records),'h','2026-10-12',own)).topPriorities,[priorities[3]])
})
test('inherited snapshots do not resurrect removed outcomes or use future plans',async()=>{
 const records={'2026-10-07':saved('2026-10-07',[]),'2026-10-08':{...saved('2026-10-08'),outcomesReviewed:false,outcomesInheritedFrom:'2026-10-06'},'2026-10-20':saved('2026-10-20')}
 assert.deepEqual((await outcomes.resolveDailyOutcomes(fake(records),'h','2026-10-12',null)).topPriorities,[])
})
test('generated daily drafts cannot silently replace standing outcomes',()=>{
 const current=saved('2026-10-07');const draft=saved('2026-10-07',[{id:'ai',title:'AI suggestion',owner:'Family',status:'pending'}]);draft.theme='New theme'
 const ops=buildPlanDraftOperations(current,draft)
 assert.ok(ops.length);assert.ok(ops.every(op=>!Object.hasOwn(op.payload.patch,'topPriorities')&&!Object.hasOwn(op.payload.patch,'priorities')))
})
test('dated standing outcomes follow the viewed day without changing the source record',async()=>{
 const source=saved('2026-10-07',[{...priorities[1],date:'2026-10-07'},{...priorities[2],date:'2026-10-30'}]);const target=await outcomes.resolveDailyOutcomes(fake({'2026-10-07':source}),'h','2026-10-12',null)
 assert.equal(target.topPriorities[0].date,'2026-10-12');assert.equal(source.topPriorities[0].date,'2026-10-07');assert.equal(target.topPriorities[1].date,'2026-10-30')
})

test('a two-item household mirror cannot truncate the complete saved outcomes list',async()=>{
 const source=saved('2026-11-16')
 source.household.priorities=priorities.slice(0,2)
 const before=structuredClone(source)
 const current=await outcomes.resolveDailyOutcomes(fake({}),'h',source.date,source)
 assert.deepEqual(current.topPriorities,priorities)
 assert.deepEqual(current.household.priorities,priorities)
 assert.equal(buildTodayReadModel({plan:current}).outcomes.length,6)
 const carried=await outcomes.resolveDailyOutcomes(fake({[source.date]:source}),'h','2026-11-17',null)
 assert.deepEqual(carried.topPriorities,priorities)
 assert.deepEqual(source,before)
})

test('outcome resolution retains distinct household rows and canonical dates without duplicate mirrors',async()=>{
 const source=saved('2026-11-16',[{id:'a',title:'Moved outcome',owner:'Family',date:'2026-11-18'}])
 source.household.priorities=[{id:'a',title:'Moved outcome',owner:'Family',date:source.date},{id:'b',title:'Another outcome',owner:'Larry'}]
 const current=await outcomes.resolveDailyOutcomes(fake({}),'h',source.date,source)
 assert.deepEqual(current.topPriorities.map(row=>row.id),['a','b'])
 assert.equal(current.topPriorities[0].date,'2026-11-18')
})

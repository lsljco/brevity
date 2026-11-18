import test from 'node:test'
import assert from 'node:assert/strict'
import {readAuthoritativeDailyPlan,buildAuthoritativeAssistantContext} from '../../netlify/lib/assistant-authoritative-context.mjs'
import {pillarRecords} from '../../netlify/lib/brevity-agent-tools.mjs'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {createEmptyDailyPlan} from '../household/dailyPlan.js'
import {visibleDayOutcomes,outcomesOperation} from '../household/dayOutcomes.js'

test('Assistant preserves standing outcomes and saves ten requested outcomes in one reviewed list',async()=>{
 const date='2026-11-18',previous='2026-11-17'
 const standing=['Larry','Terica','Lorenzo'].map((owner,i)=>({id:`standing-${i}`,title:`Standing outcome ${i}`,owner,status:i===1?'complete':'pending'}))
 const assignments=Array.from({length:8},(_,i)=>({id:`assignment-${i}`,title:`Requested outcome ${i+1}`,owner:'Larry',status:i===2?'complete':'pending',date:previous}))
 const source={...createEmptyDailyPlan(previous),outcomesReviewed:true,topPriorities:standing,assignments,household:{priorities:standing}}
 const current=createEmptyDailyPlan(date),records={[previous]:source,[date]:current},before=structuredClone(records)
 const store={getWithMetadata:async key=>({data:records[key.split('/').at(-1)]}),async *list(){yield {blobs:Object.keys(records).map(day=>({key:`h/daily-plans/${day}`}))}}}
 const canonical=await buildAuthoritativeAssistantContext({member:'Larry',date,loadDailyPlan:day=>readAuthoritativeDailyPlan(store,'h',day),loadMealWindow:async()=>null,loadActiveSermon:async()=>null})
 const household=pillarRecords('household',canonical,{})
 assert.deepEqual(household.outcomes,standing)
 assert.equal(household.outcomesInheritedFrom,previous)
 const requested=[...assignments,...[9,10].map(i=>({id:`outcome-${i}`,title:`Requested outcome ${i}`,owner:'Larry',status:'pending'}))].map(row=>({...row,date}))
 const proposal=normalizeActionProposal({operations:[outcomesOperation(canonical.dailyPlan,[...household.outcomes,...requested])]},{member:'Larry',role:'admin'})
 assert.equal(proposal.operations.length,1)
 const {after}=applyRecordOperation(canonical.dailyPlan,proposal.operations[0])
 assert.equal(after.outcomesReviewed,true)
 assert.deepEqual(visibleDayOutcomes(after,'Larry','household').map(row=>row.id),[...standing,...requested].map(row=>row.id))
 assert.equal(visibleDayOutcomes(after,'Larry','mine').length,11)
 assert.equal(after.topPriorities.find(row=>row.id==='assignment-2').status,'complete')
 assert.deepEqual(after.topPriorities,after.household.priorities)
 records[date]=after
 const tomorrow=await readAuthoritativeDailyPlan(store,'h','2026-11-19')
 assert.equal(visibleDayOutcomes(tomorrow,'Larry','household').length,13)
 assert.deepEqual(source,before[previous])
 assert.deepEqual(current,before[date])
 assert.deepEqual(after.assignments,current.assignments)
})

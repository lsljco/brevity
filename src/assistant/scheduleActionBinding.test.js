import test from 'node:test'
import assert from 'node:assert/strict'
import {bindScheduleOperation} from '../../netlify/lib/schedule-action-binding.mjs'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {householdScheduleCalendarEvents} from '../household/householdScheduleData.js'
const date='2026-10-10'
const state={blocks:[],routines:[{id:'routine-1',title:'Household Daily Standards',owner:'Larry',participants:[],enabled:true,days:[0,1,2,3,4,5,6],startTime:'08:00',endTime:'09:00'}],routineOverrides:{}}
const input={type:'household.schedule.block.delete',targetId:`household-schedule-routine-1:${date}`,targetDate:date,payloadJson:'{}',description:'Remove Larry’s block on October 10 only.'}
test('a projected routine removal cancels only the reviewed day and leaves future occurrences intact',()=>{
 const bound=bindScheduleOperation(input,{householdScheduleState:state})
 const proposal=normalizeActionProposal({summary:input.description,operations:[bound]},{member:'Larry',role:'admin'})
 const {before,after}=applyRecordOperation(state,proposal.operations[0],()=>'',{actor:'Larry'})
 assert.equal(bound.type,'household.schedule.occurrence.update')
 assert.equal(bound.targetId,'routine-1')
 assert.deepEqual(before,state)
 assert.deepEqual(after.routines,state.routines)
 assert.equal(householdScheduleCalendarEvents(after,{start:date,days:1}).length,0)
 assert.equal(householdScheduleCalendarEvents(after,{start:'2026-10-11',days:1}).length,1)
})
test('missing and mismatched dated projections cannot be retargeted',()=>{
 for(const patch of [{targetId:'household-schedule-missing:2026-10-10'},{targetDate:'2026-10-11'}])assert.throws(()=>bindScheduleOperation({...input,...patch},{householdScheduleState:state}),/no longer exists/)
 assert.throws(()=>bindScheduleOperation(input,{}),/could not be verified/)
 assert.throws(()=>bindScheduleOperation({...input,type:'household.schedule.routine.delete'},{householdScheduleState:state}),/never delete the whole routine/)
})
test('manual calendar copies resolve to the exact saved block',()=>{
 const block={id:'block-1',date,title:'One time block',owner:'Larry',participants:[]}
 const bound=bindScheduleOperation({...input,targetId:'household-schedule-block-1'},{householdScheduleState:{...state,blocks:[block]}})
 assert.equal(bound.targetId,'block-1');assert.equal(bound.type,input.type)
})

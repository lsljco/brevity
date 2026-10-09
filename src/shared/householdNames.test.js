import test from 'node:test'
import assert from 'node:assert/strict'
import {correctHouseholdPlanName,HOUSEHOLD_NAME_GUIDANCE,HOUSEHOLD_TRANSCRIPTION_PROMPT} from './householdNames.js'
import {normalizeDailyPlan} from '../household/dailyPlan.js'
test('confirmed Terica spelling repairs plan copy without changing identities or source records',()=>{
 const source={date:'2026-10-09',topPriorities:[{id:'Tarika-id',title:"Tarika's tooth cleaning",owner:'Terica'}],decisions:[{id:'d',title:'Tarik’s appointment'}],household:{keyFocus:"Tarika's tooth cleaning"}}
 const result=normalizeDailyPlan(source)
 assert.equal(result.topPriorities[0].title,"Terica's tooth cleaning")
 assert.equal(result.decisions[0].title,'Terica’s appointment')
 assert.equal(result.household.keyFocus,"Terica's tooth cleaning")
 assert.equal(result.topPriorities[0].id,'Tarika-id');assert.equal(result.topPriorities[0].owner,'Terica')
 assert.equal(source.topPriorities[0].title,"Tarika's tooth cleaning")
 assert.equal(correctHouseholdPlanName('Talk with Tarik and Tariq'),'Talk with Tarik and Tariq')
})
test('meeting transcription and assistant guidance use all canonical household names',()=>{
 for(const name of ['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah']){assert.ok(HOUSEHOLD_NAME_GUIDANCE.includes(name));assert.ok(HOUSEHOLD_TRANSCRIPTION_PROMPT.includes(name))}
 assert.match(HOUSEHOLD_NAME_GUIDANCE,/ask when identity is ambiguous/)
})

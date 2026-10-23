import test from 'node:test'
import assert from 'node:assert/strict'
import {suggestDailyOutcomes} from './outcomeSuggestions.js'
const date='2026-10-23',base={plan:{date,topPriorities:[],assignments:[]},member:'Larry'}
test('suggestions prioritize explicit urgency and goals, preserve sources and never change saved plans',()=>{
 const input={...base,plan:{...base.plan,topPriorities:[{id:'p',title:'Agreed outcome',owner:'Larry'}]},goals:[{id:'g',name:'Develop consulting practice',owner:'Larry'}],appointments:[{id:'a',title:'Interview',owner:'Larry',date,priority:'critical',time:'3:00 PM'},{id:'b',title:'Ordinary visit',owner:'Larry',date,time:'4:00 PM'}]}
 const before=structuredClone(input),result=suggestDailyOutcomes(input)
 assert.deepEqual(result.map(x=>x.id),['a','p','g']);assert.deepEqual(input,before);assert.equal(result[2].sourceKind,'goal')
})
test('suggestions exclude completed, future and other-member work, expired appointments and unknown attendance',()=>{
 const result=suggestDailyOutcomes({...base,minute:720,openWork:[{id:'x',title:'Other member',owner:'Lorenzo',originalDate:date,source:{id:'x',kind:'assignment',date}},{title:'Old task',owner:'Larry',originalDate:'2026-10-20',source:{id:'old',kind:'assignment',date:'2026-10-20'}},{title:'Tomorrow',owner:'Larry',originalDate:'2026-10-24',source:{id:'f',kind:'assignment',date:'2026-10-24'}}],goals:[{id:'done',title:'Finished goal',owner:'Larry',status:'complete'}],appointments:[{id:'past',title:'Earlier appointment',date,owner:'Larry',time:'9:00 AM'},{id:'unknown',title:'Unknown owner',date,owner:'Family',ownershipKnown:false}]})
 assert.deepEqual(result.map(x=>x.id),['old']);assert.equal(result[0].sourceDate,'2026-10-20')
})
test('same source ID is only suggested once; similar titles remain distinct records',()=>{
 const item={id:'p',title:'Review',owner:'Larry'}
 const result=suggestDailyOutcomes({...base,plan:{...base.plan,topPriorities:[item]},openWork:[{...item,originalDate:date,source:{id:'p',kind:'priority',date}},{...item,originalDate:date,source:{id:'p2',kind:'priority',date}}]})
 assert.deepEqual(result.map(x=>x.id),['p','p2'])
})

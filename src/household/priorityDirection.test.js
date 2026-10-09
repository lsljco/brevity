import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDailyAgenda} from './dailyAgenda.js'
import {todayDirection} from './priorityDirection.js'
import {chartCourseBriefing} from './chartCourseBriefing.js'
const plan={date:'2026-10-09',topPriorities:[{id:'clean',title:"Terica's tooth cleaning",time:'08:00'},{id:'think',title:'Career strategy think tank',time:'10:00'},{id:'upkeep',title:'Property upkeep review'}]}
test('Think Tank drives direction and spoken priorities ahead of routine items without changing source order',()=>{
 const agenda=buildDailyAgenda({plan,member:'Larry'})
 assert.equal(todayDirection(plan,agenda.priorities).id,'think')
 assert.deepEqual(agenda.priorities.map(x=>x.id),['think','clean','upkeep'])
 assert.equal(plan.topPriorities[0].id,'clean')
 const text=chartCourseBriefing({plan,agenda,member:'Larry'})
 assert.ok(text.indexOf('Career strategy')<text.indexOf("Terica's tooth cleaning"))
})
test('explicit focus and critical commitments override inferred strategic ranking',()=>{
 const urgent={...plan,topPriorities:[...plan.topPriorities,{id:'urgent',title:'Time-sensitive commitment',priority:'critical'}]}
 const agenda=buildDailyAgenda({plan:urgent,member:'Larry'})
 assert.equal(todayDirection(urgent,agenda.priorities).id,'urgent')
 assert.equal(todayDirection({...urgent,household:{keyFocus:'Our agreed direction'}},agenda.priorities).title,'Our agreed direction')
})
test('completed Think Tank cannot become the direction and explicit low priority is respected',()=>{
 for(const update of [{status:'complete'},{priority:'low'}]){
 const revised={...plan,topPriorities:plan.topPriorities.map(x=>x.id==='think'?{...x,...update}:x)}
 assert.equal(todayDirection(revised,buildDailyAgenda({plan:revised,member:'Larry'}).priorities).id,'clean')
 }
 assert.equal(todayDirection({},[]),null)
})

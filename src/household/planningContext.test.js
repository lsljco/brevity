import test from 'node:test'
import assert from 'node:assert/strict'
import {pillarPlanningContext,planningConflicts} from './planningContext.js'
const date='2026-10-23'
const event=(id,startTime,endTime,extra={})=>({id,title:id,date,startTime,endTime,owner:'Larry',sourceKind:'appointment',...extra})
test('pillar context uses exact dated fields and filters private ownership and finance access',()=>{
 const plan={date,spiritual:{owner:'Family',obedienceAction:'Practice patience'},fitness:{owner:'Lorenzo',objective:'Strength'},finance:{owner:'Larry',decisionRule:'Keep reserve'},topPriorities:[{id:'done',pillar:'spiritual',title:'Completed',status:'complete',owner:'Larry'},{id:'p',pillar:'spiritual',title:'Follow through',owner:'Larry'}]}
 const before=structuredClone(plan),result=pillarPlanningContext({plan,member:'Larry'})
 assert.equal(result.length,6);assert.equal(result[0].source.field,'spiritual.obedienceAction');assert.equal(result[0].source.date,date);assert.deepEqual(result[0].outcomes.map(x=>x.id),['p']);assert.equal(result.find(x=>x.pillar==='fitness').intent,'');assert.deepEqual(plan,before)
 const household=pillarPlanningContext({plan,member:'Larry',scope:'household',canViewFinance:true})
 assert.equal(household.length,7);assert.equal(household.find(x=>x.pillar==='finance').intent,'Keep reserve');assert.equal(household.find(x=>x.pillar==='fitness').intent,'Strength')
})
test('cleared, completed and future focus never become active pillar intentions',()=>{
 for(const household of [{keyFocus:'Done',keyFocusCompleted:true},{keyFocus:'Tomorrow',keyFocusDate:'2026-10-24'},{}])assert.equal(pillarPlanningContext({plan:{date,household},scope:'household'}).find(x=>x.pillar==='household').intent,'')
})
test('overlaps require the same explicitly named person; adjacent times and other people do not conflict',()=>{
 const items=[event('a','09:00','10:00'),event('b','09:30','10:30'),event('adjacent','10:30','11:00'),event('other','09:00','10:00',{owner:'Lorenzo'})]
 const before=structuredClone(items),result=planningConflicts({items,date})
 assert.equal(result.conflicts.length,1);assert.deepEqual(result.conflicts[0].records.map(x=>x.id),['a','b']);assert.deepEqual(result.conflicts[0].owners,['Larry']);assert.deepEqual(items,before)
})
test('overlap checks preserve source namespaces and deduplicate exact records',()=>{
 const items=[event('a','09:00','10:00'),event('a','09:00','10:00'),event('a','09:30','10:30',{sourceKind:'routine',owner:'Terica',participants:['Larry']})]
 const result=planningConflicts({items,date});assert.equal(result.conflicts.length,1);assert.deepEqual(result.conflicts[0].records.map(x=>x.sourceKind),['appointment','routine'])
})
test('missing times, unknown ownership and overnight ranges are incomplete, not inferred conflicts',()=>{
 const items=[event('missing','09:00',''),event('unknown','09:00','10:00',{ownershipKnown:false}),event('family','09:00','10:00',{owner:'Family'}),event('overnight','23:00','01:00'),event('all-day','','',{allDay:true})]
 const result=planningConflicts({items,date});assert.equal(result.incomplete,4);assert.equal(result.conflicts.length,0)
})
test('past, canceled, completed, other dates and mirrored timeline entries cannot create overlaps',()=>{
 const items=[event('active','09:00','10:00'),event('past','08:00','09:00'),event('canceled','09:00','10:00',{status:'canceled'}),event('done','09:00','10:00',{status:'complete'}),event('future','09:00','10:00',{date:'2026-10-24'}),event('mirror','09:00','10:00',{sourceKind:'timeline'})]
 assert.equal(planningConflicts({items,date,minute:540}).conflicts.length,0)
})

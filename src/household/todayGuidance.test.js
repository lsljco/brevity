import test from 'node:test'
import assert from 'node:assert/strict'
import {dailyGuidance,pillarDayItems} from './todayGuidance.js'
import {buildDailyAgenda} from './dailyAgenda.js'
const date='2026-10-14',member='Larry'
const item=(id,startTime,endTime,extra={})=>({id,title:id,owner:member,sourceKind:'assignment',startTime,endTime,...extra})
test('guidance separates current, next, earlier, flexible and historical work without inventing completion',()=>{
 const items=[item('past','08:00','09:00'),item('now','10:00','11:00'),item('next','12:00','13:00'),item('flex','',''),item('old','','',{date:'2026-08-19'}),item('done','09:00','10:00',{status:'complete'})]
 const model=dailyGuidance({plan:{date},agenda:{items,priorities:[]},member,minute:630})
 assert.equal(model.now.id,'now');assert.equal(model.next.id,'next');assert.deepEqual(model.earlier.map(x=>x.id),['past']);assert.deepEqual(model.remaining.map(x=>x.id),['now','next','flex']);assert.equal(model.completed.length,1)
 const night=dailyGuidance({plan:{date},agenda:{items,priorities:[]},member,minute:1260});assert.equal(night.now,null);assert.equal(night.next,null);assert.deepEqual(night.remaining.map(x=>x.id),['flex'])
})
test('current reschedules retain original source identity; historical themes stay in review queue',()=>{
 const openWork=[{id:'assignment:old',title:'Rescheduled work',owner:member,originalDate:date,source:{kind:'assignment',date:'2026-08-19',id:'old'}},{id:'focus:old',title:'Old theme',owner:member,originalDate:'2026-08-19',source:{kind:'focus',date:'2026-08-19',id:'household'}}]
 const model=dailyGuidance({plan:{date},agenda:{items:[],priorities:[]},member,openWork})
 assert.equal(model.remaining.length,1);assert.equal(model.remaining[0].id,'old');assert.equal(model.remaining[0].sourceDate,'2026-08-19')
})
test('personal priorities and pillar records respect date and owner; household view is explicit',()=>{
 const plan={date,topPriorities:[item('mine','',''),item('other','','',{owner:'Nyla'}),item('future','','',{date:'2026-10-15'})],assignments:[item('study','','',{pillar:'education'}),item('other-study','','',{pillar:'education',owner:'Nyla'})],ministry:{meetings:[{id:'today',title:'Service',owner:'Family',date},{id:'tomorrow',title:'Other',date:'2026-10-15'}]}}
 assert.deepEqual(buildDailyAgenda({plan,member}).priorities.map(x=>x.id),['mine'])
 assert.deepEqual(pillarDayItems(plan,'education',member).map(x=>x.id),['study'])
 assert.deepEqual(pillarDayItems(plan,'ministry',member).map(x=>x.id),['today'])
 assert.equal(pillarDayItems(plan,'education',member,'household').length,2)
})

test('untimed calendar commitments remain visible without becoming the next timed event or suggested task',()=>{
 const model=dailyGuidance({plan:{date},member,agenda:{priorities:[],items:[item('all-day','','',{sourceKind:'appointment'}),item('flex','',''),item('done','','',{status:'done'})]}})
 assert.deepEqual(model.remaining.map(x=>x.id),['all-day','flex']);assert.equal(model.next,null);assert.equal(model.suggested.id,'flex');assert.deepEqual(model.completed.map(x=>x.id),['done'])
})

test('a unique saved focus leads equally urgent flexible work while active and urgent work retain precedence',()=>{
 const focus=item('interview','','',{title:'Prepare for interview'}),other=item('taxes','',''),urgent=item('urgent','','',{priority:'critical'}),active=item('appointment','06:00','07:00',{sourceKind:'appointment'})
 const build=items=>dailyGuidance({plan:{date,household:{keyFocus:focus.title}},member,minute:375,agenda:{priorities:[],items}})
 assert.equal(build([other,focus]).suggested.id,'interview')
 assert.equal(build([other,focus,active]).now.id,'appointment')
 assert.equal(build([other,focus,urgent]).suggested.id,'urgent')
 assert.equal(build([other,{...focus,status:'complete'}]).suggested.id,'taxes')
 assert.equal(build([other,{...focus,date:'2026-10-15'}]).suggested.id,'taxes')
 assert.equal(build([other,focus,{...focus,id:'duplicate'}]).suggested.id,'taxes')
})

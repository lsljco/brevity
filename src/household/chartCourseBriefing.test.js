import test from 'node:test'
import assert from 'node:assert/strict'
import {chartCourseBriefing,openCourseDecisions} from './chartCourseBriefing.js'
import {buildDailyAgenda} from './dailyAgenda.js'
const plan={date:'2026-10-09',household:{keyFocus:'Submit applications'},assignments:[{id:'scheduled',title:'Think Tank',owner:'Larry',startTime:'09:15'}],topPriorities:[{id:'p',title:'Finish resume',owner:'Larry'}],decisions:[{id:'d',title:'Choose grocery owner',status:'pending'},{id:'done',title:'Old decision',status:'completed'}]}
test('opening immediately describes the displayed plan, scoped calendars and open decisions',()=>{
 const appointments=[{id:'f',title:'Family lunch',owner:'Family',startTime:'12:00'},{id:'t',title:'Private TS call',source:'icloud',appleCalendarId:'t',appleCalendarOwner:'Terica',owner:'Family'}]
 const agenda=buildDailyAgenda({plan,appointments,member:'Larry'})
 const text=chartCourseBriefing({plan,agenda,member:'Larry'})
 for(const expected of ['Submit applications','Finish resume','Family lunch','Choose grocery owner','Think Tank at 09:15, Larry','What questions'])assert.ok(text.includes(expected))
 for(const absent of ['Private TS call','Old decision'])assert.ok(!text.includes(absent))
 assert.equal(openCourseDecisions(plan).length,1)
})
test('missing data is stated without inventing a schedule or claiming calendar verification',()=>{
 const text=chartCourseBriefing({plan:{date:'2026-10-09'},agenda:{priorities:[],pending:[]},member:'Larry',calendarReady:false})
 assert.match(text,/No household focus/);assert.match(text,/No open priorities/);assert.match(text,/not fully verified/);assert.doesNotMatch(text,/no appointments/)
})
test('briefing bounds spoken lists while retaining outstanding decisions on screen',()=>{
 const decisions=Array.from({length:6},(_,i)=>({id:String(i),title:`Decision ${i}`}))
 const text=chartCourseBriefing({plan:{...plan,decisions},agenda:{priorities:[],pending:[]},member:'Larry'})
 assert.match(text,/More decisions/);assert.ok(!text.includes('Decision 5'));assert.equal(openCourseDecisions({decisions}).length,6)
})

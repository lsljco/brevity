import test from 'node:test'
import assert from 'node:assert/strict'
import {focusBubbles,groupTodayItems,isMajorCalendarItem} from './todayPresentation.js'
import {dailyGuidance} from './todayGuidance.js'
const date='2026-10-16'
const task=(owner,id=owner)=>({id,owner,title:'Financial Review',sourceKind:'assignment',date,priority:'high'})
test('shared tasks group once while retaining separate owner IDs and statuses',()=>{
 const items=[task('Larry'),{...task('Terica'),status:'blocked'}],before=structuredClone(items)
 const grouped=groupTodayItems(items)
 assert.equal(grouped.length,1);assert.deepEqual(grouped[0].displayOwners,['Larry','Terica'])
 assert.deepEqual(grouped[0].sourceRecords,items);assert.deepEqual(items,before)
 assert.equal(groupTodayItems([...items,{...task('Larry','later'),startTime:'15:00'}]).length,2)
})
test('older combined focus text becomes separate numbered bubble data without creating assignments',()=>{
 const focus='Financial Review Daily Schedule Alignment Linked in & Résumé Optimization'
 const bubbles=focusBubbles(focus,[task('Larry'),task('Terica'),{...task('Larry','schedule'),title:'Daily Schedule Alignment'}])
 assert.deepEqual(bubbles.map(x=>x.title),['Financial Review','Daily Schedule Alignment','Linked in & Résumé Optimization'])
 assert.ok(bubbles.every(x=>x.sourceKind==='focus'))
})
test('personal guidance excludes others and unassigned alerts even if an agenda includes them',()=>{
 const agenda={items:[task('Larry'),task('Terica'),{id:'bank',title:'Send bank files',owner:'Lorenzo',sourceKind:'appointment',startTime:'11:00'}],priorities:[task('Larry'),task('Terica')]}
 const signals=[{id:'overdue',title:'Overdue: Clean floors',action:'household'}]
 const mine=dailyGuidance({plan:{date},agenda,member:'Larry',signals})
 assert.deepEqual(mine.remaining.map(x=>x.id),['Larry']);assert.equal(mine.next,null)
 assert.deepEqual(mine.attention.map(x=>x.id),['Larry'])
 const household=dailyGuidance({plan:{date},agenda,member:'Larry',scope:'household',signals})
 assert.equal(household.remaining.filter(x=>x.title==='Financial Review').length,1)
 assert.deepEqual(household.attention.map(x=>x.id),['Larry'])
})
test('only the responsible verifiers see pending chore sign-off',()=>{
 const chores=[{id:'floors',occurrenceId:'today-floors',title:'Floors',owners:['Nyla'],verifiers:['Larry','Terica'],occurrence:{submittedAt:'2026-10-16'}}]
 const get=member=>dailyGuidance({plan:{date},member,agenda:{items:[],priorities:[]},chores})
 assert.equal(get('Larry').attention[0].sourceKind,'signoff');assert.equal(get('Terica').attention.length,1);assert.equal(get('Javin').attention.length,0)
 chores[0].occurrence.approvedAt='2026-10-16';assert.equal(get('Larry').attention.length,0)
})
test('doctor appointments and explicitly important events outrank routine tutor reminders',()=>{
 assert.equal(isMajorCalendarItem({title:'TS- Dr. Appointment'}),true)
 assert.equal(isMajorCalendarItem({title:'Isaiah Daily Tutor',recurring:true,priority:'normal'}),false)
 assert.equal(isMajorCalendarItem({title:'Deadline',priority:'high'}),true)
})

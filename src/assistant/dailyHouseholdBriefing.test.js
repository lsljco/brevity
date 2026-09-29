import test from 'node:test'
import assert from 'node:assert/strict'
import {dailyHouseholdBriefing} from '../../netlify/lib/daily-household-briefing.mjs'
const context=()=>({signedInMember:'Larry',householdDate:'2026-09-29',sources:[{id:'daily-plan',state:'available'},{id:'shared-action-records',state:'available'},{id:'rolling-meals',state:'available'}],supplementalSources:{'apple-calendar':'available','household-maintenance':'available','household-schedule':'available','activity:2026-09-29':'available'},access:{finance:true,education:true},dailyPlan:{date:'2026-09-29',topPriorities:[{title:'Follow up school plan'}],spiritual:{devotionFocus:'Read'},health:{owner:'Terica'},fitness:{workout:'Legs'},education:{thinkTankTopic:'Reading'},finance:{bills:[{title:'Review invoice'}]},ministry:{prayerNeeds:['Wisdom']},assignments:[{title:'Open task',status:'pending'},{title:'Done task',status:'complete'}]},appleFamilyCalendar:{events:[{id:'visit',title:'Tutor',date:'2026-09-29',owner:'Larry',time:'14:45'}]},rollingMealPlan:{days:[{date:'2026-09-29',meals:{lunch:{name:'Chicken'}}}]},recentActivities:[{date:'2026-09-29',entries:[{kind:'workout',member:'Larry',title:'Reported walk'},{kind:'workout',member:'Terica',title:'Private other member'}]}]})
test('one briefing covers all pillars, current schedule and unfinished work without conflating plans and reports',()=>{
 const result=dailyHouseholdBriefing(context())
 assert.equal(Object.keys(result.pillars).length,7);assert.equal(result.pillars.household.schedule.personalAppointments.length,1)
 assert.equal(result.pillars.household.openAssignments.length,1);assert.equal(result.pillars.fitness.reportedWorkouts.length,1);assert.equal(result.pillars.fitness.plannedWorkout.title,'Legs · Strength A')
 assert.equal(result.pillars.health.plannedMeals.lunch.name,'Chicken');assert.match(result.pillars.health.notice,/not consumed/)
 assert.match(result.pillars.finance.notice,/not live bank balances/);assert.equal(result.readOnly,true)
})
test('restricted and unavailable sources stay explicit without leaking education or finance records',()=>{
 const c=context();c.access={finance:false,education:false};c.dailyPlan=null;c.supplementalSources={}
 const result=dailyHouseholdBriefing(c)
 assert.deepEqual(result.pillars.finance,{access:'not-permitted'});assert.deepEqual(result.pillars.education,{access:'not-permitted'})
 assert.equal(result.pillars.household.schedule.sources.appleCalendar,'unavailable');assert.equal(result.pillars.spiritual.plan,null)
 assert.ok(!JSON.stringify(result).includes('Private other member'))
})

test('a missing daily plan still uses Today’s weekly workout program, but an outage does not pretend saved overrides are known',()=>{
 const c=context();c.dailyPlan=null;c.sources=[{id:'daily-plan',state:'missing'}]
 assert.equal(dailyHouseholdBriefing(c).pillars.fitness.plannedWorkout.title,'Legs · Strength A')
 c.sources=[{id:'daily-plan',state:'unavailable'}]
 assert.equal(dailyHouseholdBriefing(c).pillars.fitness.plannedWorkout,null)
})

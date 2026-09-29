import {workoutForDate} from '../../src/fitness/fitnessWorkoutPlan.js'
import {householdSchedule} from './household-schedule.mjs'

// A single authorized read gives the agent today's cross-pillar context without
// seven sequential tool calls. Planned work is never evidence of completion.
export function dailyHouseholdBriefing(context){
 const date=context.householdDate,plan=context.dailyPlan?.date===date?context.dailyPlan:null
 const state=id=>context.sources?.find(source=>source.id===id)?.state||'unavailable'
 const activities=(context.recentActivities||[]).flatMap(day=>day?.date===date?day.entries||[]:[]).filter(item=>!item.member||item.member===context.signedInMember)
 const byKind=kind=>activities.filter(item=>item.kind===kind)
 const schedule=householdSchedule(context,date)
 const workout=state('daily-plan')==='unavailable'?null:workoutForDate(date,context.signedInMember,plan?.fitness||{})
 const plannedWorkout=workout?{title:workout.title,focus:workout.focus,duration:workout.duration,stepGoal:workout.stepGoal,exercises:workout.exercises.map(item=>item.name),source:plan?.fitness?.exerciseIds?.length?'saved-daily-workout':'weekly-workout-program',notice:'Planned program shown on Today, not proof of a completed workout.'}:null
 const financeAllowed=context.access?.finance===true,educationAllowed=context.access?.education===true
 return {date,member:context.signedInMember,timeZone:'America/New_York',readOnly:true,
  sources:{dailyPlan:state('daily-plan'),meals:state('rolling-meals'),sermon:state('active-sermon'),...schedule.sources,activities:context.supplementalSources?.[`activity:${date}`]||'unavailable'},
  priorities:plan?.topPriorities||[],focus:plan?.dayObjective||'',
  pillars:{
   spiritual:{plan:plan?.spiritual||null,activeSermon:context.activeSermon||null,reportedStudy:byKind('study-note')},
   health:{plan:plan?.health||null,plannedMeals:context.rollingMealPlan?.days?.find(day=>day.date===date)?.meals||null,ownRecordedConsumption:context.nutritionUnavailable?null:context.dailyNutrition||null,notice:'Planned meals are not consumed meals. Missing consumption reports do not establish that no food was eaten.'},
   fitness:{plan:plan?.fitness||null,plannedWorkout,reportedWorkouts:byKind('workout')},
   household:{plan:plan?.household||null,schedule,openAssignments:schedule.assignments.filter(item=>!['complete','deferred'].includes(item.status)),decisions:plan?.decisions||[]},
   education:educationAllowed?{plan:plan?.education||null,recordedSessions:context.learningRecord?.sessions?.filter(item=>item.date===date)||[],source:context.supplementalSources?.['learning-record']||'unavailable'}:{access:'not-permitted'},
   finance:financeAllowed?{plan:plan?.finance||null,upcomingSchedule:context.actionRecords?.finance?.upcomingSchedule||{state:'unavailable'},reportedExpenses:byKind('expense'),notice:'These are saved plans and reported expenses, not live bank balances or proof of payment. Use the finance read tool for more detail; do not invent current cash or declare bills paid.'}:{access:'not-permitted'},
   ministry:{plan:plan?.ministry||null,reportedFollowups:byKind('ministry-followup')},
  },
  notice:'Give a concise household morning briefing: urgent conflicts, scheduled bills and unresolved commitments first, then appointments, responsibilities and relevant pillar priorities. Identify unassigned work and missing plans as gaps, not failures or completed work. Use actual source availability; never infer that nothing is due from an unavailable source. Distinguish the member’s personal commitments from shared events and other owners. No writes, no automatic initialization and no invented health or financial recommendations. Fetch a pillar only if more detail is necessary.'}
}

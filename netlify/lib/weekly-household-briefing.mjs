export function weeklyHouseholdBriefing(context){
 const days=(context.recentDailyPlans||[]).filter(Boolean),activities=((context.recentActivities||[]).filter(Boolean)).flatMap(day=>day.entries||[]),nutrition=(context.recentNutrition||[]).filter(Boolean)
 const unavailable=Object.entries(context.supplementalSources||{}).filter(([,state])=>state==='unavailable').map(([key])=>key)
 const incomplete=group=>unavailable.some(key=>key.startsWith(group+':'))
 const nutritionIncomplete=context.nutritionUnavailable||incomplete('nutrition'),activityIncomplete=incomplete('activity'),planIncomplete=incomplete('plan')
 const byKind=kind=>activities.filter(item=>item.kind===kind)
 const assignments=days.flatMap(day=>(day.assignments||[]).map(item=>({...item,date:day.date})))
 const completed=assignments.filter(item=>item.status==='complete')
 const dates=days.map(day=>day.date).concat(nutrition.map(day=>day.date)).sort()
 return {member:context.signedInMember,through:context.householdDate,from:context.historyStartDate||dates[0],scope:'Shared household plans and tasks; only the signed-in member’s private activity and nutrition. Missing records do not mean an activity did not happen.',
  nutrition:{coverage:nutritionIncomplete?'incomplete':'available',unavailableDates:unavailable.filter(key=>key.startsWith('nutrition:')).map(key=>key.slice(10)),notice:nutritionIncomplete?'Nutrition could not be fully read. Totals and counts are unknown, not zero. Available days are partial records only.':'Counts describe saved records, not unreported consumption.',daysLogged:nutritionIncomplete?null:nutrition.filter(day=>day.entries?.length).length,meals:nutritionIncomplete?null:nutrition.reduce((n,day)=>n+(day.entries?.length||0),0),days:nutrition.map(({date,totals})=>({date,totals})),targets:context.nutritionTargets},
  fitness:{coverage:activityIncomplete?'incomplete':'available',reportedWorkouts:activityIncomplete?null:byKind('workout').length,reportedMinutes:activityIncomplete?null:byKind('workout').reduce((n,item)=>n+(item.durationMinutes||0),0),progress:byKind('progress')},
  household:{coverage:planIncomplete?'incomplete':'available',recordedAssignments:planIncomplete?null:assignments.length,completedAssignments:planIncomplete?null:completed.length,openAssignments:assignments.filter(item=>!['complete','deferred'].includes(item.status)),reportedMaintenance:byKind('maintenance')},
  education:context.learningRecord?{sessions:(context.learningRecord.sessions||[]).filter(item=>item.date>=context.historyStartDate&&item.date<=context.householdDate).map(({date,responses,notes})=>({date,responses,notes})),skillMastery:context.learningRecord.skillMastery}:null,
  spiritual:{studyNotes:byKind('study-note')},ministry:{sermonNotes:byKind('sermon-note'),followups:byKind('ministry-followup')},
  finance:context.access?.finance===false?{access:'not-permitted'}:{reportedExpenses:byKind('expense'),currentSavedPlan:context.actionRecords?.finance,notice:'Reported expenses are separate from verified bank transactions; do not subtract them again from bank balances.'},
  health:{sleep:byKind('sleep'),hydration:byKind('hydration')},unavailableSources:unavailable,
  nextActions:assignments.filter(item=>!['complete','deferred'].includes(item.status)).slice(0,5).map(item=>({title:item.title,owner:item.owner,date:item.date,reason:'Recorded unfinished assignment'}))}
}

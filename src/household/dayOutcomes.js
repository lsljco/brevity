import {cleanPlanItem} from './dailyPlanActionReview.js'
import {belongsToViewer} from './todayGuidance.js'
export function savedDayOutcomes(plan){
 const rows=plan.topPriorities?.length?plan.topPriorities:plan.household?.priorities||[]
 const outcomes=rows.map((row,index)=>typeof row==='string'?{id:`outcome-${plan.date}-${index}`,title:row,owner:'Family',status:'pending'}:{...row,id:row.id||`outcome-${plan.date}-${index}`}).filter(row=>row.title?.trim())
 if(plan.household?.keyFocus?.trim()&&!plan.household.keyFocusCompleted&&!outcomes.some(row=>row.title.trim()===plan.household.keyFocus.trim()))outcomes.push({id:`outcome-focus-${plan.date}`,title:plan.household.keyFocus.trim(),owner:plan.household.owner||'Family',status:'pending',date:plan.household.keyFocusDate||plan.date})
 return outcomes
}
export function visibleDayOutcomes(plan,member,scope='mine'){
 return savedDayOutcomes(plan).filter(row=>(!row.date||row.date===plan.date)&&belongsToViewer(row,member,scope))
}
export function outcomesOperation(plan,rows){
 return {type:'plan.pillar.update',targetDate:plan.date,targetId:'household',description:`Update outcomes for ${plan.date}`,payload:{pillar:'household',patch:{priorities:rows.map(row=>cleanPlanItem({...row,title:row.title.trim()})).filter(row=>row.title),keyFocus:''}}}
}

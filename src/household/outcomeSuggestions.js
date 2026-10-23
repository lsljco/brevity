import {priorityImpact} from './priorityDirection.js'
import {isPersonalItem} from './todayPresentation.js'
import {minuteOfDay} from './dailyRhythm.js'
const list=value=>Array.isArray(value)?value:[]
const closed=item=>item.cancelled||['done','complete','completed','approved','cancelled','canceled','deferred'].includes(String(item.status||'').toLowerCase())
// Suggestions never mutate a plan or imply completion. Preserve exact source IDs.
export function suggestDailyOutcomes({plan,member,scope='mine',openWork=[],appointments=[],goals=[],minute=0}){
 const candidates=[],seen=new Set()
 const standingIds=new Set(list(plan.topPriorities).map(item=>item.id))
 const hasStandingList=Boolean(plan.outcomesReviewed||plan.outcomesInheritedFrom||standingIds.size)
 const add=(item,kind,date,reason,weight)=>{
  if(!item?.id||!String(item.title||'').trim()||closed(item)||(scope!=='household'&&!isPersonalItem(item,member)))return
  const key=`${kind}:${item.id}`
  if(seen.has(key))return
  seen.add(key)
  candidates.push({...item,sourceKind:kind,sourceDate:date,reason,score:priorityImpact(item)*100+weight})
 }
 for(const item of list(plan.topPriorities))if(!item.date||item.date===plan.date)add(item,'priority',plan.outcomesInheritedFrom||plan.date,'An agreed outcome is still unfinished.',80)
 for(const item of openWork)if(item.originalDate<=plan.date&&item.source?.id&&item.source?.kind!=='focus'&&!(hasStandingList&&item.source.kind==='priority'&&!standingIds.has(item.source.id)))add({...item,id:item.source.id},item.source.kind,item.source.date,item.originalDate<plan.date?'Unfinished work from an earlier day.':'Saved work scheduled for this day.',50)
 for(const item of list(plan.assignments))if(!item.date||item.date===plan.date)add(item,'assignment',plan.date,'An assigned commitment for this day.',40)
 for(const goal of goals){if(!goal||typeof goal!=='object')continue;add({...goal,owner:goal.owner||'Family',title:goal.nextStep||goal.title||goal.name},'goal','',goal.nextStep?'A saved next step toward your goal.':'A saved goal to review for a concrete next step.',60)}
 for(const item of appointments){const end=minuteOfDay(item.endTime||item.startTime||item.time);if(item.date!==plan.date||item.ownershipKnown===false||(end!==null&&end<minute))continue;add(item,'appointment',plan.date,'An upcoming appointment to prepare for.',20)}
 return candidates.sort((a,b)=>b.score-a.score||`${a.sourceKind}:${a.id}`.localeCompare(`${b.sourceKind}:${b.id}`)).slice(0,3)
}

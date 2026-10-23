import {HOUSEHOLD_SCHEDULE_SOURCE} from './householdScheduleData.js'
import {HOUSEHOLD_MEMBERS, PILLAR_IDS} from './dailyPlan.js'
import {isPersonalItem} from './todayPresentation.js'
import {minuteOfDay} from './dailyRhythm.js'
const list=value=>Array.isArray(value)?value:[]
const finished=item=>item.cancelled||['done','complete','completed','approved','cancelled','canceled','deferred','awaiting sign-off'].includes(String(item.status||'').toLowerCase())
export const PLANNING_PILLAR_LABELS={spiritual:'Spiritual Maturity',health:'Health & Nutrition',fitness:'Physical Fitness',household:'Household Management',education:'Education',finance:'Finance & Stewardship',ministry:'Ministry & Fellowship'}
const intentFields={spiritual:['obedienceAction','todayFocus','devotionFocus'],health:['nextDayPrep','hydration'],fitness:['objective','goal','workout'],household:['keyFocus'],education:['thinkTankDeliverable','thinkTankTopic'],finance:['decisionRule'],ministry:['contentFocus']}
// Dated intentions are context, not newly invented goal records or completion evidence.
export function pillarPlanningContext({plan,member,scope='mine',canViewFinance=false}){
 return PILLAR_IDS.filter(pillar=>pillar!=='finance'||canViewFinance).map(pillar=>{
  const section=plan[pillar]||{},visible=scope==='household'||isPersonalItem(section,member)
  const field=visible&&intentFields[pillar].find(key=>typeof section[key]==='string'&&section[key].trim()&&!(pillar==='household'&&(section.keyFocusCompleted||section.keyFocusDate>plan.date)))
  const outcomes=list(plan.topPriorities).filter(item=>item.pillar===pillar&&!finished(item)&&(!item.date||item.date===plan.date)&&(scope==='household'||isPersonalItem(item,member)))
  return {pillar,label:PLANNING_PILLAR_LABELS[pillar],intent:field?section[field].trim():'',source:field?{date:plan.date,planId:plan.id||`daily-plan-${plan.date}`,field:`${pillar}.${field}`}:null,outcomes:outcomes.filter(x=>x.id).map(({id,title})=>({id,title,sourceDate:plan.outcomesInheritedFrom||plan.date}))}
 })
}
const people=item=>[...new Set([item.owner,...list(item.owners),...list(item.participants),...list(item.members)].filter(name=>HOUSEHOLD_MEMBERS.includes(name)))]
export function planningConflicts({items=[],date,minute=0}){
 const seen=new Set(),eligible=[];let incomplete=0
 const scheduleCopies=new Set(items.filter(x=>['routine','block'].includes(x.sourceKind)&&x.id).map(x=>`${HOUSEHOLD_SCHEDULE_SOURCE}-${x.id}`))
 for(const item of items){
  if(item.sourceKind==='appointment'&&scheduleCopies.has(item.calendarSourceId||((item.calendarSource===HOUSEHOLD_SCHEDULE_SOURCE)?item.calendarEventId:'')))continue
  // Timeline rows can mirror assigned work and do not have independent record IDs.
  if(!item.id||!item.sourceKind||item.sourceKind==='timeline'||finished(item)||(item.date&&item.date!==date))continue
  const key=JSON.stringify([item.sourceKind,item.id]);if(seen.has(key))continue;seen.add(key)
  const start=minuteOfDay(item.startTime||item.time),end=minuteOfDay(item.endTime),owners=item.ownershipKnown===false?[]:people(item)
  if(item.allDay)continue
  if(start===null||end===null||end<=start||!owners.length){incomplete++;continue}
  if(end<=minute)continue
  eligible.push({item,start,end,owners,key})
 }
 const conflicts=[]
 for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
  const a=eligible[i],b=eligible[j],owners=a.owners.filter(name=>b.owners.includes(name))
  if(!owners.length||a.start>=b.end||b.start>=a.end)continue
  conflicts.push({id:JSON.stringify([a.key,b.key]),owners,records:[a.item,b.item].map(x=>({id:x.id,sourceKind:x.sourceKind,title:x.title,date,startTime:x.startTime||x.time,endTime:x.endTime,routineId:x.routineId,calendarEventId:x.calendarEventId,calendarSourceId:x.calendarSourceId,appleCalendarId:x.appleCalendarId,choreOccurrenceId:x.choreOccurrenceId}))})
 }
 return {conflicts,incomplete}
}

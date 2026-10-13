import {HOUSEHOLD_MEMBERS,normalizeProjectItem} from '../homehq/projectData.js'
import {householdClock,minuteOfDay} from './dailyRhythm.js'
import {normalizeHouseholdScheduleState,routineOccurrencesForDate} from './householdScheduleData.js'
import {buildHouseholdMaintenanceWeek,normalizeHouseholdMaintenanceState,householdOccurrence,occurrenceStatus} from './householdMaintenanceData.js'
import {connectRoutineChores,linkedChoreId} from './routinePlanning.js'
const list=value=>Array.isArray(value)?value:[]
const names=item=>[...new Set([item.owner,...list(item.owners),...list(item.participants),...list(item.members)].filter(name=>HOUSEHOLD_MEMBERS.includes(name)))]
const closed=item=>['done','complete','completed','approved','cancelled','deferred'].includes(String(item.status||'').toLowerCase())||item.cancelled===true
const onDate=(item,date)=>String(item.date||item.start||'').slice(0,10)<=date&&String(item.endDate||item.date||item.start||'').slice(0,10)>=date
export function responsibilityStatus(item,minute,report={}){
 if(closed(item))return 'Completed'
 if(/awaiting sign-off/i.test(item.status))return 'Awaiting verification'
 if(report.state==='needs-help'||/exception|returned/i.test(item.status))return 'Needs help'
 const end=minuteOfDay(item.endTime)
 if(item.kind!=='calendar'&&end!==null&&minute>end)return 'Overdue'
 if(report.state==='in-progress'||/in progress/i.test(item.status))return 'In progress'
 return 'Scheduled'
}
export function buildDailyResponsibilities({date,plan={},schedule={},maintenance={},calendar=[],projects=[],meals={},sources={}},member,now=new Date(),reports={}){
 const clock=householdClock(now),state=normalizeHouseholdScheduleState(schedule),care=normalizeHouseholdMaintenanceState(maintenance)
 const tasks=buildHouseholdMaintenanceWeek(new Date(`${date}T12:00:00`),care).find(day=>day.date===date)?.tasks.map(task=>({...task,occurrence:householdOccurrence(care,task),status:occurrenceStatus(task,householdOccurrence(care,task))}))||[]
 const routines=connectRoutineChores(routineOccurrencesForDate(state,date),tasks).filter(item=>!item.cancelled)
 const linked=new Set(routines.map(linkedChoreId).filter(Boolean)),all=[],gaps=[]
 const add=(item,kind,id,targetId=id)=>{
  if(!id||item.cancelled||String(item.status).toLowerCase()==='cancelled')return
  const owners=names(item),time=item.startTime||item.time||''
  const row={id:`${kind}:${id}`,targetId,kind,date,title:item.title||item.name||'Untitled responsibility',time,endTime:item.endTime||'',owners,status:item.status||'Scheduled',notes:item.notes||'',signoffRequired:Boolean(item.signoffRequired),source:item.source||kind}
  if(!owners.length&&!closed(item))gaps.push({...row,reason:'Owner to confirm'})
  if(owners.includes(member)){
   if(!time&&!item.allDay&&!closed(item))gaps.push({...row,reason:'Time to agree'})
   row.progress=responsibilityStatus(row,clock.date===date?clock.minute:0,reports[row.id]);all.push(row)
  }
 }
 for(const item of list(plan.assignments).filter(item=>!item.date||item.date===date))add(item,'assignment',item.id)
 for(const block of list(plan.dayparts))for(const [index,item] of list(block.items).entries())add(item,'daypart',`${block.id}:${item.id||index}`,item.id||`${block.id}:${index}`)
 if(list(plan.fitness?.participants).includes(member)&&plan.fitness.departureTime)add({title:`Depart for ${plan.fitness.location||'the gym'}`,owner:member,startTime:plan.fitness.departureTime},'fitness','departure')
 for(const item of state.blocks.filter(item=>item.date===date))add({...item,participants:list(item.participants).filter(name=>item.attendance?.[name]==='accepted')},'block',item.id)
 for(const item of routines)if(item.choreOccurrenceId)add({...item,signoffRequired:tasks.find(task=>task.occurrenceId===item.choreOccurrenceId)?.signoffRequired},'chore',item.choreOccurrenceId);else add(item,'routine',item.id,item.routineId)
 for(const item of tasks.filter(item=>!linked.has(item.id))){const owners=item.occurrence.coveredBy?[item.occurrence.coveredBy]:item.owners?.includes('Everyone')?HOUSEHOLD_MEMBERS:item.owners;add({...item,owners},'chore',item.occurrenceId)}
 // Only named attendees get appointments; source-managed copies come from their authoritative records above.
 for(const item of calendar.filter(item=>onDate(item,date)&&!/^household-(schedule|operation)-|^project-|^daily-/.test(item.sourceId||item.id||'')))add(item,'calendar',item.id)
 for(const raw of projects){const item=normalizeProjectItem(raw);if(item.due!==date||closed(item))continue;add({...item,owner:'',owners:item.raci.responsible,participants:[]},'project',item.id)}
 for(const [slot,meal] of Object.entries(meals||{})){
  if(!['breakfast','lunch','dinner'].includes(slot)||!meal?.name)continue
  const assigned=list(plan.assignments).some(item=>String(item.notes||'').includes(`[meal:${slot}]`)&&names(item).length)
  if(!assigned)gaps.push({id:`meal:${slot}`,kind:'meal',targetId:slot,date,title:`Cook ${slot}: ${meal.name}`,reason:'Cook and preparation time to confirm'})
 }
 const items=[...new Map(all.map(item=>[item.id,item])).values()].sort((a,b)=>(minuteOfDay(a.time)??1440)-(minuteOfDay(b.time)??1440)||a.title.localeCompare(b.title))
 return {date,member,items,gaps:[...new Map(gaps.map(item=>[item.id,item])).values()],sources:Object.fromEntries(['plan','schedule','maintenance','calendar','projects','meals'].map(key=>[key,sources[key]||'unavailable'])),updatedAt:now.toISOString(),counts:Object.fromEntries(['Scheduled','In progress','Awaiting verification','Overdue','Needs help','Completed'].map(status=>[status,items.filter(item=>item.progress===status).length]))}
}
export function briefingAssistantPrompt(item,member){
 const action=item.kind==='meal'?`Assign cooking for ${item.title}. Ask who will cook and the preparation start/end times, then prepare an assignment.create review for ${item.date} with notes containing [meal:${item.targetId}]. Do not infer the cook from who scheduled the meal.`:`Help ${member} report completion, request help, or reschedule ${item.title} on ${item.date}. Read the exact ${item.kind} record ID ${item.targetId} first. ${item.kind==='routine'?'Change only this dated occurrence, not the whole routine. ':''}Preserve chore checklists and required sign-off. Use the existing reviewed Action Mode change; do not create a duplicate task.`
 return action
}

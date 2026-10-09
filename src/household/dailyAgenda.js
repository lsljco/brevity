import {DAILY_BLOCKS,minuteOfDay,isFinished,namedFor} from './dailyRhythm.js'
import {routineOccurrencesForDate,normalizeHouseholdScheduleState} from './householdScheduleData.js'
export function buildDailyAgenda({plan={},schedule={},chores=[],appointments=[],member,scope='mine',minute=0}){
 const state=normalizeHouseholdScheduleState(schedule),date=plan.date,routines=routineOccurrencesForDate(state,date)
 const blocks=state.blocks.filter(x=>x.date===date).map(x=>({...x,participants:(x.participants||[]).filter(m=>x.attendance?.[m]==='accepted')}))
 const records=[...(plan.assignments||[]).map(x=>({...x,sourceKind:'assignment'})),...routines.map(x=>({...x,sourceKind:'routine'})),...blocks.map(x=>({...x,sourceKind:'block'})),...chores.map(x=>({...x,id:x.occurrenceId,owner:x.occurrence?.coveredBy||x.owner,owners:x.occurrence?.coveredBy?[x.occurrence.coveredBy]:x.owners,sourceKind:'chore'})),...appointments.map(x=>({...x,startTime:x.startTime||x.time,sourceKind:'appointment'}))]
 const seen=new Set(),items=records.filter(x=>{const key=`${x.sourceKind}:${x.id}`;if(!x.id||seen.has(key))return false;seen.add(key);return true}).filter(x=>scope==='household'||namedFor(x,member)||x.owner==='Family').map(x=>({...x,block:DAILY_BLOCKS.find(b=>minuteOfDay(x.startTime)>=b.start&&minuteOfDay(x.startTime)<b.end)?.label||'Time to agree'})).sort((a,b)=>(minuteOfDay(a.startTime)??1440)-(minuteOfDay(b.startTime)??1440))
 const pending=items.filter(x=>!isFinished(x)),completed=items.filter(x=>isFinished(x)&&!['deferred','cancelled'].includes(String(x.status).toLowerCase()))
 const gaps=pending.filter(x=>x.sourceKind!=='appointment'&&(![x.owner,...(x.owners||[])].some(n=>n&&n!=='Family')||minuteOfDay(x.startTime)===null))
 return {items,pending,completed,gaps,next:pending.find(x=>minuteOfDay(x.startTime)!==null&&minuteOfDay(x.startTime)>=minute),routines}
}

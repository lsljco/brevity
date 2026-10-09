import {HOUSEHOLD_MEMBERS} from '../homehq/projectData.js'
import {todayCalendarAppointments} from './todayCalendar.js'
import {minuteOfDay,namedFor} from './dailyRhythm.js'
import {normalizeHouseholdScheduleState,routineOccurrencesForDate} from './householdScheduleData.js'
import {buildHouseholdMaintenanceWeek,householdOccurrence,occurrenceStatus} from './householdMaintenanceData.js'
import {scheduleVariantFor} from './scheduleVariants.js'
export const linkedChoreId=routine=>String(routine.notes||'').match(/^\[chore:([^\]]+)\]/)?.[1]||''
export function connectRoutineChores(routines,chores){return routines.map(routine=>{const id=linkedChoreId(routine),chore=chores.find(x=>x.id===id);return id?{...routine,status:chore?.status||'pending',cancelled:!chore,owner:chore?.occurrence?.coveredBy||routine.owner,participants:chore?.occurrence?.coveredBy?[]:routine.participants,owners:chore?.occurrence?.coveredBy?[chore.occurrence.coveredBy]:chore?.owners||[],choreOccurrenceId:chore?.occurrenceId}:routine})}
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`
const datePlus=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const overlaps=(a,b)=>a.start<b.end&&b.start<a.end
export function buildRoutineReview({date,member,schedule={},maintenance={},calendar=[],variant='',days=[1,2,3,4,5],calendarAvailable=true}){
 if(!HOUSEHOLD_MEMBERS.includes(member))throw Error('Choose a household member.')
 const state=normalizeHouseholdScheduleState(schedule),questions=[],proposals=[],week=[]
 if(!calendarAvailable)questions.push('Calendar could not be verified. Review it before approving new times.')
 const templates=new Set(state.routines.map(linkedChoreId).filter(Boolean))
 for(let offset=0;offset<7;offset++){
  const target=datePlus(date,offset),weekday=new Date(target+'T12:00:00Z').getUTCDay()
  const tasks=buildHouseholdMaintenanceWeek(new Date(target+'T12:00:00'),maintenance).find(x=>x.date===target)?.tasks||[]
  const chores=tasks.filter(x=>x.owners.includes(member)||x.owners.includes('Everyone')).map(x=>({...x,status:occurrenceStatus(x,householdOccurrence(maintenance,x))}))
  const routines=connectRoutineChores(routineOccurrencesForDate(state,target),tasks.map(x=>({...x,occurrence:householdOccurrence(maintenance,x),status:occurrenceStatus(x,householdOccurrence(maintenance,x))}))).filter(x=>!x.cancelled&&namedFor(x,member))
  const linked=new Set(routines.map(linkedChoreId).filter(Boolean))
  const events=todayCalendarAppointments(calendar,member).filter(x=>x.date<=target&&(x.endDate||x.date)>=target)
  const blocks=state.blocks.filter(x=>x.date===target&&(x.owner===member||x.participants?.includes(member)&&x.attendance?.[member]==='accepted'))
  const busy=[...events,...routines,...blocks].flatMap(x=>{const start=minuteOfDay(x.startTime||x.time),end=minuteOfDay(x.endTime);return start===null||end===null?[]:[{start,end,title:x.title}]})
  const uncertain=events.some(x=>minuteOfDay(x.startTime||x.time)===null||minuteOfDay(x.endTime)===null)
  if(uncertain)questions.push(`${member}: calendar timing on ${target} is incomplete or all-day; confirm availability before adding a routine.`)
  const conflicts=[];for(let i=0;i<busy.length;i++)for(let j=i+1;j<busy.length;j++)if(overlaps(busy[i],busy[j]))conflicts.push(`${busy[i].title} overlaps ${busy[j].title}`)
  for(const chore of chores){
   if(templates.has(chore.id)||/custom|saturday/i.test(chore.occurrenceId))continue
   if(!calendarAvailable||uncertain)continue
   const start=minuteOfDay(chore.startTime),end=minuteOfDay(chore.endTime)
   const window=start!==null&&end!==null?{start,end}:/^2[–-]4 PM$/.test(chore.timing)?{start:840,end:960}:null
   if(!window){questions.push(`${member}: ${chore.title} on ${target} — confirm a time and duration (${chore.timing}).`);continue}
   let proposed=null
   for(let t=Math.max(window.start,720);t+30<=window.end;t+=15){const candidate={start:t,end:t+30};if(!busy.some(x=>overlaps(x,candidate))){proposed=candidate;break}}
   if(!proposed){questions.push(`${member}: no verified 30-minute flex slot for ${chore.title} on ${target}.`);continue}
   proposals.push({title:chore.title,owner:member,participants:chore.owners.filter(x=>x!==member&&HOUSEHOLD_MEMBERS.includes(x)),days:[weekday],startTime:clock(proposed.start),endTime:clock(proposed.end),pillar:'Household Management',enabled:true,notes:`[chore:${chore.id}] Proposed 30-minute work block within ${chore.timing}. Completion and sign-off remain on the original chore. Review capacity before approving.`,sourceTitle:'Saved recurring chore',sourceId:chore.id})
   templates.add(chore.id);busy.push({...proposed,title:chore.title})
  }
  week.push({date:target,weekday,conflicts,availabilityUncertain:uncertain,items:[...events.map(x=>({...x,source:'Calendar',startTime:x.startTime||x.time})),...blocks.map(x=>({...x,source:'Time block'})),...routines.map(x=>({...x,source:'Routine'})),...chores.filter(x=>!linked.has(x.id)).map(x=>({...x,source:'Chore'}))].sort((a,b)=>(minuteOfDay(a.startTime)??1440)-(minuteOfDay(b.startTime)??1440))})
 }
 if(variant){
  const reference=scheduleVariantFor(member,variant)
  if(reference){
   const source=`[schedule-reference:${variant}:${member}]`
   const items=reference.items.filter(x=>minuteOfDay(x.startTime)!==null&&minuteOfDay(x.endTime)!==null&&minuteOfDay(x.endTime)<=480)
   if(items.length&&!state.routines.some(x=>String(x.notes||'').startsWith('[schedule-reference:')&&x.owner===member)){
    const start=items[0].startTime,end=items.at(-1).endTime
    const collision=week.some(day=>days.includes(day.weekday)&&(day.availabilityUncertain||day.items.some(x=>{const a=minuteOfDay(x.startTime),b=minuteOfDay(x.endTime);return a!==null&&b!==null&&overlaps({start:a,end:b},{start:minuteOfDay(start),end:minuteOfDay(end)})})))
    if(collision||!calendarAvailable)questions.push(`${member}: Schedule ${variant} morning overlaps a saved commitment or calendar availability is unverified. Resolve before creating it.`)
    else proposals.push({title:`Schedule ${variant} morning routine`,owner:member,participants:[],days,startTime:start,endTime:end,pillar:'Household Management',enabled:true,notes:source+' '+items.map(x=>`${x.startTime}–${x.endTime} ${x.title}`).join('; ')+'. Reference times proposed for review; completion is never automatic.',sourceTitle:'Household Schedule A–D',sourceId:source})
   }
   questions.push(...reference.needsClarification)
   questions.push('Schedule stages at or after 8 AM require review against protected focus time; they are not automatically added.')
  }
 }else questions.push(`${member}: choose an agreed Schedule A–D variant before adding morning reference times.`)
 return {member,date,week,proposals,questions:[...new Set(questions)],notice:'Proposed work blocks are not completion records. Existing recurring calendars remain linked to their original calendar records; they are not copied into duplicate appointments. Times are checked against the loaded week, not a guarantee for all future weeks.'}
}

import {minuteOfDay, scheduleAFor} from './dailyRhythm.js'

// Household-supplied chart: Daily fitness schedule and game plans, July 14, 2026.
// Keep unclear source times empty. These are reference plans, never saved commitments.
export const SCHEDULE_WINDOWS = [
 {id:'A',label:'Full gym and recovery',start:0,end:265,wakeWindow:'By 4:24 AM'},
 {id:'B',label:'Shorter gym and streamlined recovery',start:265,end:285,wakeWindow:'4:25–4:44 AM'},
 {id:'C',label:'Local gym and condensed morning',start:285,end:315,wakeWindow:'4:45–5:14 AM'},
 {id:'D',label:'Home or nearest-gym micro-session',start:315,end:1440,wakeWindow:'5:15 AM onward'},
]
export function variantForWakeTime(wakeTime){
 const minute=minuteOfDay(wakeTime)
 return minute===null?null:SCHEDULE_WINDOWS.find(x=>minute>=x.start&&minute<x.end)?.id||null
}
const commonEnd=[['07:30','08:50','Household reset and preparation','household'],['09:00','','Household Management / Think Tank','education']]
const stages={
 B:{
  early:[['04:25','04:35','Wake, hygiene, fuel and bag check','household'],['04:35','04:45','Departure window','fitness'],['05:00','05:08','Arrival and warm-up','fitness'],['05:08','05:45','Strength session','fitness'],['05:45','05:55','Recovery and devotion','spiritual'],['05:55','06:20','Shower and dress at gym','household'],['06:20','06:45','Return home','household'],['06:45','07:30','Breakfast and hydration','health'],...commonEnd],
  family:[['04:25','04:40','Wake, hygiene and morning preparation','household'],['04:40','04:50','Bag check and coordination','household'],['04:50','05:05','Travel to local gym','fitness'],['05:05','05:30','Strength or class','fitness'],['05:30','05:40','Recovery and devotion','spiritual'],['05:40','05:55','Return home','household'],['05:55','06:15','Shower and dress','household'],['06:15','07:20','Breakfast and hydration','health'],['07:30','08:50','Household contributions and preparation','household'],['','','Household Management / Think Tank','education']],
 },
 C:{
  early:[['04:45','04:55','Wake, hygiene, fuel and bag check','household'],['04:55','05:10','Travel to local gym','fitness'],['05:10','05:15','Dynamic warm-up','fitness'],['05:15','05:50','Condensed strength session','fitness'],['05:50','06:00','Optional recovery and devotion','spiritual'],['06:00','06:15','Return home','household'],['06:15','06:45','Shower and dress at home','household'],['06:45','07:30','Breakfast and hydration','health'],...commonEnd],
  family:[['04:45','05:00','Wake, hygiene and morning preparation','household'],['05:00','05:15','Travel to local gym','fitness'],['05:15','05:40','Strength or circuit session','fitness'],['05:40','05:50','Recovery and devotion','spiritual'],['05:50','06:05','Return home','household'],['06:05','06:35','Shower and dress','household'],['06:35','07:20','Breakfast and hydration','health'],['07:20','08:50','Household contributions and preparation','household'],['','','Household Management / Think Tank','education']],
 },
 D:{
  early:[['05:15','05:25','Wake, hygiene and quick fuel','household'],['05:25','05:30','Mobility warm-up','fitness'],['05:30','06:00','Home or nearest-gym strength micro-session','fitness'],['','','Shower and dress','household'],['','','Breakfast and hydration','health'],['07:20','08:50','Household reset and preparation','household'],['','','Household Management / Think Tank','education']],
  family:[['05:15','05:25','Wake and hygiene','household'],['05:25','05:30','Quick warm-up','fitness'],['05:30','06:00','Home or nearest-gym circuit','fitness'],['06:00','06:10','Devotion','spiritual'],['06:10','06:40','Shower and dress','household'],['06:40','07:20','Breakfast and hydration','health'],['07:20','08:50','Household contributions and preparation','household'],['','','Household Management / Think Tank','education']],
 },
}
export function scheduleVariantFor(member,variant){
 if(!SCHEDULE_WINDOWS.some(x=>x.id===variant))return null
 if(!['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah','Zion'].includes(member))return {variant,items:[],needsClarification:['No member-specific schedule is recorded for this person.']}
 const early=['Larry','Lorenzo'].includes(member)
 const items=variant==='A'?scheduleAFor(member==='Isaiah'?'Terica':member).items.map(x=>({...x,owner:member,source:x.source.replace(':Terica:',`:${member}:`)})):
 stages[variant][early?'early':'family'].map(([startTime,endTime,title,pillar],i)=>({title,startTime,endTime,pillar,owner:member,source:`schedule-${variant.toLowerCase()}:${member}:stage-${i+1}`}))
 return {variant,group:early?'Larry & Lorenzo':'Terica, Nyla, Isaiah & Javin',...SCHEDULE_WINDOWS.find(x=>x.id===variant),items,needsClarification:items.filter(x=>!x.startTime).map(x=>`${x.title}: confirm its exact time; the reference is incomplete or conflicts with the preceding block.`)}
}
export function scheduleReferenceFor(member,{wakeTime,variant,assignments=[]}={}){
 const fromWake=variantForWakeTime(wakeTime),explicit=String(variant||'').toUpperCase()
 const saved=[...new Set(assignments.filter(x=>x.owner===member&&!['deferred','cancelled'].includes(x.status)).map(x=>String(x.source||'').match(/^schedule-([abcd]):/)?.[1]?.toUpperCase()).filter(Boolean))]
 const selected=SCHEDULE_WINDOWS.some(x=>x.id===explicit)?explicit:fromWake||(saved.length===1?saved[0]:null)
 const reference=selected?scheduleVariantFor(member,selected):null
 const elapsed=reference&&fromWake?reference.items.filter(x=>minuteOfDay(x.startTime)!==null&&minuteOfDay(x.startTime)<minuteOfDay(wakeTime)).map(x=>x.title):[]
 return {source:'Daily fitness schedule and game plans · July 14, 2026; existing Schedule A reference',member,wakeTime:wakeTime||null,selectedVariant:selected,selectionBasis:explicit===selected?'explicit request':fromWake?'reported wake time':selected?'saved assignment sources':'not established',windows:SCHEDULE_WINDOWS,variants:reference?[reference]:SCHEDULE_WINDOWS.map(x=>scheduleVariantFor(member,x.id)),needsClarification:[...(explicit&&fromWake&&explicit!==fromWake?['The requested variant differs from the reported wake window. Confirm which to use.']:[]),...(!selected?['Which schedule is agreed for this date, or what time did this member wake?']:[]),...(reference?.needsClarification||[]),...(elapsed.length?[`These reference stages begin before the reported wake time: ${elapsed.join(', ')}. Agree feasible adjusted times before saving.`]:[])],rules:'Reference only, not evidence of attendance or completed work. Saved dated commitments and current household policies take precedence, including current gym location and devotion order. Never overwrite them from this older reference. Read exact source IDs and current versions before changes. Match prior A–D assignments by source, not title; update or retire superseded variant assignments in the same reviewed daily-plan proposal, preserving completed work. Never create a second full variant beside the first. Missing or infeasible times require one concise clarification. Prepare assignment changes through Action Mode; do not create calendar appointments merely to make reminders work. Saved timed assignments already feed Today and device reminders.'}
}

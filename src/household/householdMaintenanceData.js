import { FAMILY_CALENDAR_KEY, HOUSEHOLD_MEMBERS, readJson, writeJson } from '../homehq/projectData.js'

export const HOUSEHOLD_MAINTENANCE_STORAGE_KEY = 'brevity_household_maintenance_v1'
export const HOUSEHOLD_OPERATIONS_SOURCE = 'household-operations'
export const HOUSEHOLD_OPERATING_PRINCIPLE = 'Make controlled progress every day so the house never requires an emergency cleaning operation.'
export const HOUSEHOLD_OPERATING_STANDARDS = [
  { title:'Personal responsibility', detail:'Bedroom, clothes, belongings, food/drink, spills, and personal messes belong to the person who created them.' },
  { title:'Completion over clock time', detail:'The 2–4 PM window creates structure; completion matters more than using every minute.' },
  { title:'No giant cleaning debt', detail:'Use Friday catch-up or Sunday reset instead of stacking missed work onto the next day.' },
  { title:'Split oversized tasks', detail:'If a task routinely will not fit the available block, divide it.' },
  { title:'Protect the evening', detail:'If Dad did not pick Javin up, Javin connects with him first, then completes the 20–30 minute closeout before fully settling in.' },
]

// The uploaded plan defines a seven-week Saturday rotation but does not specify a calendar anchor.
// Brevity initializes the operating week containing September 3, 2026 as Week 1 so the cycle is deterministic.
export const SATURDAY_ROTATION_ANCHOR = '2026-08-31'
const SATURDAY_ROTATION = [
  'Three upstairs balconies',
  'Two main-floor balconies',
  'Porches / exterior presentation',
  'Cars',
  'Windows / glass',
  'Dog beds + deeper pet-area cleaning',
  'Catch-up / no special project',
]

const task = value => ({ calendarEnabled:true, standard:value.details?.[0] || '', ...value })
const nyla = value => task({ timing:'2–4 PM', owners:['Nyla'], ...value })
const javin = value => task({ timing:'After work · 20–30 min closeout', owners:['Javin'], ...value })

const WEEKLY_TASKS = {
  1:[
    nyla({ id:'monday-nyla-upstairs', title:'Upstairs bathrooms + hall/landing', category:'Weekday zone', zone:'Upstairs', details:['Upstairs presentation restored before evening','Bathrooms: toilets, sinks/counters, mirrors, tub/shower as needed, trash, straighten towels/items','Common areas: remove clutter, dust obvious surfaces, straighten hallway/landing'] }),
    javin({ id:'monday-javin-upstairs', title:'Upstairs floors + stairs', category:'Closeout', zone:'Upstairs', details:['Upstairs floors and stairs closed out','Vacuum upstairs hallway/common areas','Vacuum stairs','Mop hard flooring where needed'] }),
  ],
  2:[
    nyla({ id:'tuesday-nyla-main-floor', title:'Main-floor living, dining + common areas', category:'Weekday zone', zone:'Main Floor', details:['Main-floor common areas restored before evening','Straighten couches, pillows, tables, dining area, and office/common-space clutter','Dust surfaces, return misplaced items, and remove visible marks/smudges'] }),
    javin({ id:'tuesday-javin-main-floor', title:'Vacuum + mop main-floor common areas', category:'Closeout', zone:'Main Floor', details:['Main-floor floors closed out','Vacuum main-floor common areas','Mop main-floor hard flooring, including the kitchen floor'] }),
  ],
  3:[
    nyla({ id:'wednesday-nyla-kitchen', title:'Kitchen detail', category:'Weekday zone', zone:'Kitchen', details:['Kitchen returned to a clean, usable condition','Handle dishes; clean sink, counters, stovetop, appliance fronts, dining surfaces, and spot-clean cabinets','Check refrigerator for obvious spills/old food; handle trash/recycling as needed'] }),
    javin({ id:'wednesday-javin-garage-gym', title:'Garage gym reset + cleaning', category:'Closeout', zone:'Garage Gym', details:['Garage gym reset and ready for use','Put equipment back in place and straighten weights/accessories','Wipe benches/equipment and mirrors as needed','Sweep/vacuum gym area and remove obvious garage clutter/trash'] }),
  ],
  4:[
    nyla({ id:'thursday-nyla-basement', title:'Bottom-floor common areas + bathroom', category:'Weekday zone', zone:'Bottom Floor / Basement', details:['Bottom-floor presentation restored before evening','Common areas: clutter, furniture, tables, dusting, and trash','Bathroom: toilet, sink, mirror, counter, tub/shower as needed'] }),
    javin({ id:'thursday-javin-basement', title:'Basement floors + stairs', category:'Closeout', zone:'Bottom Floor / Basement', details:['Basement floors and stairs closed out','Vacuum basement','Mop hard surfaces','Vacuum/clean basement stairs'] }),
  ],
  5:[
    nyla({ id:'friday-nyla-utility-catchup', title:'Pet/utility area + one missed zone', category:'Catch-up', zone:'Utility / Pet Area', details:['Utility/pet area restored and at most one unfinished weekday zone recovered','Clean dog/kennel area, dog pads, surrounding floor, dirty surfaces, and organize cleaning/utility supplies','Catch up on ONE unfinished weekday zone if necessary — not the entire backlog'] }),
    javin({ id:'friday-javin-trouble-spot', title:'Trouble-spot sweep', category:'Closeout', zone:'Whole House', details:['Most visible trouble spot corrected without creating a second cleaning shift','20–30 minute trouble-spot sweep','Fix the most visibly dirty area','Trash check and quick floor touch-up if needed'] }),
  ],
  0:[
    task({ id:'sunday-joint-reset', title:'Joint 60–90 minute household reset', timing:'60–90 minutes together', category:'Household reset', zone:'Whole House', owners:['Javin','Nyla'], details:['CLEAN → ORGANIZED → READY FOR MONDAY','Floors: vacuum high-traffic areas; mop visibly dirty hard floors; address stairs as needed','Kitchen: dishes, counters, sink, trash, and floor presentation check','Bathrooms: quick presentation check; correct anything that deteriorated during the week','Common Areas: couches, tables, clutter, trash, and straightening','Pet Areas: check kennel/dog pads; address odor or visible dirt','Supplies: check toilet paper, paper towels, trash bags, and cleaning products'] }),
  ],
}

function saturdayRotationIndex(date) {
  const anchor = maintenanceWeekStart(parseMaintenanceDate(SATURDAY_ROTATION_ANCHOR))
  const week = maintenanceWeekStart(date)
  const diff = Math.floor((week.getTime() - anchor.getTime()) / (7 * 86400000))
  return ((diff % SATURDAY_ROTATION.length) + SATURDAY_ROTATION.length) % SATURDAY_ROTATION.length
}
function saturdayTasks(date) {
  const index = saturdayRotationIndex(date)
  const item = SATURDAY_ROTATION[index]
  return [
    nyla({ id:'saturday-nyla-light-reset', title:'Saturday light reset', timing:'Flexible', category:'Flexible maintenance', zone:'Whole House', details:['Complete a light reset only; Saturday is not another mandatory major-cleaning day','Restore obvious clutter and presentation issues','Do not create unnecessary cleaning work when the house is already in good condition'] }),
    javin({ id:`saturday-javin-rotation-${index + 1}`, title:`Rotation Week ${index + 1}: ${item}`, timing:'Flexible · only if needed', category:'Rotating maintenance', zone:'Flexible Maintenance', details:['Condition beats calendar: clean what actually needs attention','Handle one heavier maintenance item only when it is actually needed',`Scheduled rotation: ${item}`,'If this item is already clean and another area clearly needs attention, address the actual need instead'] }),
  ]
}

export function parseMaintenanceDate(value){if(value instanceof Date&&!Number.isNaN(value.getTime()))return new Date(value.getFullYear(),value.getMonth(),value.getDate());const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!match)return null;const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));return Number.isNaN(date.getTime())?null:date}
export function maintenanceDateKey(value){const date=parseMaintenanceDate(value)||new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function maintenanceWeekStart(value=new Date()){const date=parseMaintenanceDate(value)||new Date(),day=date.getDay();date.setDate(date.getDate()-(day===0?6:day-1));return date}
function addDays(date,amount){const result=new Date(date);result.setDate(result.getDate()+amount);return result}
export function buildHouseholdMaintenanceWeek(anchor=new Date()){const weekStart=maintenanceWeekStart(anchor);return Array.from({length:7},(_,index)=>{const date=addDays(weekStart,index),dateKey=maintenanceDateKey(date),templates=date.getDay()===6?saturdayTasks(date):(WEEKLY_TASKS[date.getDay()]||[]);return{date:dateKey,label:date.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}),tasks:templates.map(template=>({...template,owners:[...template.owners],details:[...template.details],occurrenceId:`${dateKey}:${template.id}`}))}})}
export function householdOperationZones(days=[]){return ['All Zones',...new Set(days.flatMap(day=>day.tasks.map(item=>item.zone).filter(Boolean)))]}
export function normalizeHouseholdMaintenanceState(value={}){const legacy=value.completions&&typeof value.completions==='object'?value.completions:{},occurrences=value.occurrences&&typeof value.occurrences==='object'?value.occurrences:legacy;return{version:3,trackingStartedOn:/^\d{4}-\d{2}-\d{2}$/.test(String(value.trackingStartedOn||''))?value.trackingStartedOn:maintenanceDateKey(new Date()),occurrences,completions:occurrences}}
export function householdOccurrence(state,task){return state.occurrences?.[task.occurrenceId]||state.completions?.[task.occurrenceId]||{}}
export function summarizeHouseholdMaintenance(days,state,today=new Date()){const todayKey=maintenanceDateKey(today),tasks=days.flatMap(day=>day.tasks),completed=tasks.filter(task=>householdOccurrence(state,task).complete).length,exceptions=tasks.filter(task=>householdOccurrence(state,task).exception).length,covered=tasks.filter(task=>householdOccurrence(state,task).coveredBy).length,overdue=tasks.filter(task=>{const taskDate=task.occurrenceId.slice(0,10);return taskDate>=state.trackingStartedOn&&taskDate<todayKey&&!householdOccurrence(state,task).complete}).length,dueToday=tasks.filter(task=>task.occurrenceId.startsWith(todayKey)).length;return{scheduled:tasks.length,completed,overdue,dueToday,exceptions,covered}}
export function householdOperationCalendarEvent(task,occurrence={}){const members=occurrence.coveredBy?[occurrence.coveredBy]:task.owners.includes('Everyone')?[...HOUSEHOLD_MEMBERS]:task.owners;return{id:`household-operation-${task.occurrenceId}`,sourceId:`household-operation-${task.occurrenceId}`,source:HOUSEHOLD_OPERATIONS_SOURCE,title:task.title,date:task.occurrenceId.slice(0,10),start:task.occurrenceId.slice(0,10),allDay:true,members,participants:members,owner:members.length===1?members[0]:'Family',calendarName:'Family',calendarSyncEnabled:true,status:occurrence.complete?'Complete':occurrence.exception?'Exception':'Scheduled',notes:[task.zone,task.timing,task.standard,occurrence.exception?`Exception: ${occurrence.exception}`:''].filter(Boolean).join(' · '),updatedAt:occurrence.updatedAt||new Date().toISOString()}}
export function publishHouseholdOperationEvents(storage,state,weeks=6){const start=maintenanceWeekStart(new Date()),tasks=[];for(let index=0;index<weeks;index+=1){const anchor=addDays(start,index*7);buildHouseholdMaintenanceWeek(anchor).forEach(day=>day.tasks.forEach(item=>{if(item.calendarEnabled)tasks.push(item)}))}const prior=readJson(storage,FAMILY_CALENDAR_KEY,[]),other=(Array.isArray(prior)?prior:[]).filter(event=>event.source!==HOUSEHOLD_OPERATIONS_SOURCE),events=tasks.map(item=>householdOperationCalendarEvent(item,householdOccurrence(state,item))),result=writeJson(storage,FAMILY_CALENDAR_KEY,[...other,...events]);if(result.ok&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('brevity-family-calendar-updated',{detail:events}));return{...result,events}}

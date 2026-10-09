import {scheduleReferenceFor} from '../../src/household/scheduleVariants.js'
import {householdScheduleCalendarEvents} from '../../src/household/householdScheduleData.js'
import {buildHouseholdMaintenanceWeek,householdOccurrence,occurrenceStatus} from '../../src/household/householdMaintenanceData.js'
const dateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const list = value => Array.isArray(value) ? value : []
const fields = ['id','uid','sourceId','projectId','title','date','time','endDate','endTime','allDay','owner','participants','members','location','status','priority','href','etag','updatedAt']
const pick = event => Object.fromEntries(fields.filter(key => event[key] !== undefined).map(key => [key,event[key]]))

export function compactAssistantCalendar(calendar) {
  return {events:list(calendar?.events).map(pick),verifiedAt:calendar?.verifiedAt||calendar?.fetchedAt||''}
}

// Only server-loaded, already authorized household records enter this view.
// Shared events with no named participant must not silently become personal events.
export function householdSchedule(canonical, requestedDate = 'today', referenceOptions = {}) {
  let date = requestedDate === 'today' ? canonical.householdDate : requestedDate
  if (requestedDate === 'tomorrow') {
    const next = new Date(`${canonical.householdDate}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    date = next.toISOString().slice(0,10)
  }
  if (!dateKey(date)) throw Error('Use today, tomorrow, or a valid YYYY-MM-DD date.')
  const member = canonical.signedInMember
  const onDate = event => event.date <= date && (event.endDate || event.date) >= date
  const sharedState = canonical.sources?.find(source => source.id === 'shared-action-records')?.state || 'unavailable'
  const appleAvailable = canonical.supplementalSources?.['apple-calendar'] === 'available' && Array.isArray(canonical.appleFamilyCalendar?.events)
  const apple = appleAvailable ? canonical.appleFamilyCalendar.events.filter(event=>sharedState!=='available'||!String(event.sourceId||'').startsWith('project-')).filter(onDate).map(event => ({...pick(event),source:'Apple Calendar'})) : []
  const local = sharedState === 'available' ? list(canonical.actionRecords?.familyCalendarEvents).filter(onDate).map(event => ({...pick(event),source:event.projectId?'Projects':'Brevity Calendar'})) : []
  // Keep both calendars' records rather than guessing that matching titles are duplicates.
  const events = [...apple,...local].sort((a,b) => `${a.allDay?'00:00':a.time||'99:99'} ${a.title}`.localeCompare(`${b.allDay?'00:00':b.time||'99:99'} ${b.title}`))
  const namedFor = event => [event.owner,...list(event.participants),...list(event.members)].some(name => String(name).toLowerCase() === String(member).toLowerCase())
  const hasNamedMember = event => [event.owner,...list(event.participants),...list(event.members)].some(name => name && !['family','household','everyone'].includes(String(name).toLowerCase()))
  const plan = date === canonical.householdDate ? canonical.dailyPlan : list(canonical.recentDailyPlans).find(day => day.date === date)
  const scheduleAvailable=canonical.supplementalSources?.['household-schedule']==='available'
  const choresAvailable=canonical.supplementalSources?.['household-maintenance']==='available'
  const timeBlocks=scheduleAvailable?householdScheduleCalendarEvents(canonical.householdScheduleState||{},{start:date,days:1}).filter(onDate):[]
  const chores=choresAvailable?buildHouseholdMaintenanceWeek(new Date(`${date}T12:00:00`),canonical.householdMaintenanceState||{}).find(day=>day.date===date)?.tasks.map(task=>({...task,status:occurrenceStatus(task,householdOccurrence(canonical.householdMaintenanceState||{},task))}))||[]:[]
  return {date,member,scheduleReference:scheduleReferenceFor(member,{...referenceOptions,assignments:plan?.assignments||[]}),timeZone:'America/New_York',events,timeBlocks,chores,
    projectWindows:events.filter(event=>event.projectId),
    personalAppointments:events.filter(event=>!event.projectId&&namedFor(event)),
    sharedAppointments:events.filter(event => !event.projectId&&!hasNamedMember(event)),
    otherMemberAppointments:events.filter(event => !event.projectId&&hasNamedMember(event) && !namedFor(event)),
    assignments:plan ? list(plan.assignments) : [],
    sources:{householdSchedule:scheduleAvailable?'available':'unavailable',householdChores:choresAvailable?'available':'unavailable',appleCalendar:appleAvailable?'available':'unavailable',brevityCalendar:sharedState,dailyPlan:canonical.supplementalSources?.[`plan:${date}`] || (date === canonical.householdDate ? canonical.sources?.find(source=>source.id==='daily-plan')?.state : 'not-loaded') || 'unavailable'},
    notice:'Read-only schedule. Projects are date windows with RACI members, not appointments or proof that every named member attends continuously. Open or edit them by exact projectId through Projects. Include appointment times and distinguish named personal appointments from shared or other-member appointments. Do not infer ownership from initials in titles. A time overlap is a confirmed personal scheduling conflict only when both records explicitly name the member as attending. Describe overlaps involving unassigned shared records as possible overlaps requiring attendance confirmation; do not call their travel, pickup or other responsibilities the member’s own. All-day or multi-day hotel/trip spans may be informational windows, not continuous busy time; qualify this instead of declaring every overlapping appointment a conflict. Tasks, timeBlocks and chores are separate from appointments. Use chore occurrenceId for existing chore changes and the exact source IDs for time-block changes; never substitute an assignment for a saved chore. An unavailable source is not an empty schedule. Do not claim a future daily plan is empty when not loaded. Source records may overlap; do not double-count an apparent duplicate without matching identifiers.'}
}

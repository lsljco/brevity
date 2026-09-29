const dateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const list = value => Array.isArray(value) ? value : []
const fields = ['id','uid','sourceId','title','date','time','endDate','endTime','allDay','owner','participants','members','location','status','priority','href','etag','updatedAt']
const pick = event => Object.fromEntries(fields.filter(key => event[key] !== undefined).map(key => [key,event[key]]))

export function compactAssistantCalendar(calendar) {
  return {events:list(calendar?.events).map(pick),verifiedAt:calendar?.verifiedAt||calendar?.fetchedAt||''}
}

// Only server-loaded, already authorized household records enter this view.
// Shared events with no named participant must not silently become personal events.
export function householdSchedule(canonical, requestedDate = 'today') {
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
  const apple = appleAvailable ? canonical.appleFamilyCalendar.events.filter(onDate).map(event => ({...pick(event),source:'Apple Calendar'})) : []
  const local = sharedState === 'available' ? list(canonical.actionRecords?.familyCalendarEvents).filter(onDate).map(event => ({...pick(event),source:'Brevity Calendar'})) : []
  // Keep both calendars' records rather than guessing that matching titles are duplicates.
  const events = [...apple,...local].sort((a,b) => `${a.allDay?'00:00':a.time||'99:99'} ${a.title}`.localeCompare(`${b.allDay?'00:00':b.time||'99:99'} ${b.title}`))
  const namedFor = event => [event.owner,...list(event.participants),...list(event.members)].some(name => String(name).toLowerCase() === String(member).toLowerCase())
  const hasNamedMember = event => [event.owner,...list(event.participants),...list(event.members)].some(name => name && !['family','household','everyone'].includes(String(name).toLowerCase()))
  const plan = date === canonical.householdDate ? canonical.dailyPlan : list(canonical.recentDailyPlans).find(day => day.date === date)
  return {date,member,timeZone:'America/New_York',events,
    personalAppointments:events.filter(namedFor),
    sharedAppointments:events.filter(event => !hasNamedMember(event)),
    otherMemberAppointments:events.filter(event => hasNamedMember(event) && !namedFor(event)),
    assignments:plan ? list(plan.assignments) : [],
    sources:{appleCalendar:appleAvailable?'available':'unavailable',brevityCalendar:sharedState,dailyPlan:canonical.supplementalSources?.[`plan:${date}`] || (date === canonical.householdDate ? canonical.sources?.find(source=>source.id==='daily-plan')?.state : 'not-loaded') || 'unavailable'},
    notice:'Read-only schedule. Include appointment times and distinguish named personal appointments from shared or other-member appointments. Do not infer ownership from initials in titles. Tasks are separate from appointments. An unavailable source is not an empty schedule. Do not claim a future daily plan is empty when not loaded. Source records may overlap; do not double-count an apparent duplicate without matching identifiers.'}
}

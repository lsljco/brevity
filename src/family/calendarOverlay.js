const arrayOrEmpty = value => Array.isArray(value) ? value : []
const clean = value => String(value || '').trim()

const timeMinutes = value => {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if (!match) return -1
  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'PM' && hour < 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
}

export function compareCalendarEventsChronologically(left, right) {
  const leftAllDay = Boolean(left?.allDay || !clean(left?.time || left?.startTime))
  const rightAllDay = Boolean(right?.allDay || !clean(right?.time || right?.startTime))
  if (leftAllDay !== rightAllDay) return leftAllDay ? -1 : 1
  const leftMinutes = timeMinutes(left?.time || left?.startTime)
  const rightMinutes = timeMinutes(right?.time || right?.startTime)
  if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes
  return clean(left?.title).localeCompare(clean(right?.title))
}

// An explicit sourceId is lineage, not a resemblance match. Occurrence dates
// distinguish instances of recurring series. Provider IDs never join sources.
export function calendarRecordIdentity(event, fallbackDate = '') {
  const date = clean(event?.date || event?.start || fallbackDate)
  const recurring = event?.recurring || event?.recurrenceId || event?.originalStart || clean(event?.id).includes('::')
  const occurrence = recurring ? clean(event?.recurrenceId || event?.originalStart || date) : ''
  if (clean(event?.sourceId)) return JSON.stringify(['source', clean(event.sourceId), occurrence])
  const id = clean(event?.id || event?.uid || event?.href)
  if (!id) return ''
  const apple = event?.source === 'icloud' || event?.calendarSource === 'icloud'
  return JSON.stringify([apple ? 'apple' : 'source', id, occurrence])
}

const eventAuthority = event => event?.source === 'project' ? 3 : event?.source === 'icloud' ? 2 : 1

export function dedupeCalendarEvents(events) {
  const unique = new Map()
  arrayOrEmpty(events).forEach((event, index) => {
    if (!clean(event?.title) || !clean(event?.date || event?.start)) return
    const signature = calendarRecordIdentity(event) || `unlinked:${index}`
    const current = unique.get(signature)
    if (!current || eventAuthority(event) > eventAuthority(current)) unique.set(signature, event)
  })
  return [...unique.values()]
}

export function calendarEventsForDate(events, date) {
  return dedupeCalendarEvents(events).filter(event => clean(event?.date || event?.start) <= date && clean(event?.endDate || event?.end || event?.date || event?.start) >= date)
}

export function calendarAppointmentFromEvent(event) {
  return {
    id: `${event.source || 'icloud'}-${clean(event.id || event.uid || event.href)}`,
    calendarEventId: clean(event.id || event.uid),
    calendarSourceId: clean(event.sourceId),
    calendarHref: clean(event.href),
    calendarSource: event.source || 'icloud',
    projectId: event.projectId || '',
    readOnly: true,
    title: clean(event.title) || 'Untitled event',
    notes: event.source === 'project' ? 'Managed in Projects. Open the project to review changes.' : `Synced from ${event.appleCalendarName || 'the Apple Family Calendar'}.`,
    date: clean(event.date),
    startTime: clean(event.time),
    endTime: '',
    allDay: Boolean(event.allDay || !event.time),
    owner: clean(event.owner) || 'Family',
    ownershipKnown: event.ownershipKnown,
    appleCalendarName:event.appleCalendarName,
    appleCalendarId:event.appleCalendarId,
    calendarScope: event.calendarScope,
    pillar: event.pillar,
    participants: arrayOrEmpty(event.participants),
    status: 'pending',
    priority: event.priority ? 'high' : 'normal',
    calendarSync: false,
    notificationLevel: 'awareness',
  }
}

export function calendarAppointmentsForPlan(plan, events) {
  const date = clean(plan?.date)
  const existing = arrayOrEmpty(plan?.household?.appointments)
    .filter(item => !item?.date || item.date === date)
  const identities = new Set(existing.flatMap(item => {
    const linkedId = clean(item.calendarSourceId)
    const providerId = clean(item.calendarEventId)
    return [
      calendarRecordIdentity({id:item.id, date:item.date || date}),
      ...(item.calendarSync && item.id ? [
        calendarRecordIdentity({sourceId:`daily-${date}-${item.id}`}),
        calendarRecordIdentity({sourceId:`assistant-daily-${date}-${item.id}`}),
      ] : []),
      linkedId ? calendarRecordIdentity({sourceId:linkedId, date:item.date || date}) : '',
      providerId ? calendarRecordIdentity({id:providerId, source:item.calendarSource || 'icloud', date:item.date || date}) : '',
    ].filter(Boolean)
  }))
  const additions = []

  calendarEventsForDate(events, date).forEach((event, index) => {
    const identity = calendarRecordIdentity(event)
    if (identity && identities.has(identity)) return
    if (identity) identities.add(identity)
    const appointment = calendarAppointmentFromEvent(event)
    if (!clean(event.id || event.uid || event.href)) appointment.id = `unlinked-calendar-${date}-${index}`
    additions.push(appointment)
  })

  return [...existing, ...additions].sort(compareCalendarEventsChronologically)
}

export function mergeCalendarEventsIntoPlan(plan, events) {
  return {
    ...plan,
    household: {
      ...(plan?.household || {}),
      appointments: calendarAppointmentsForPlan(plan, events),
    },
  }
}

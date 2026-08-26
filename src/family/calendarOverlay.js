const arrayOrEmpty = value => Array.isArray(value) ? value : []
const clean = value => String(value || '').trim()
const normalizeText = value => clean(value).toLocaleLowerCase().replace(/\s+/g, ' ')

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

const appointmentSignature = (item, fallbackDate = '') => [
  normalizeText(item?.title),
  clean(item?.date || fallbackDate),
  timeMinutes(item?.startTime || item?.time),
].join('|')

const calendarEventSignature = event => [
  normalizeText(event?.title),
  clean(event?.date || event?.start),
  timeMinutes(event?.startTime || event?.time),
  normalizeText(event?.owner || 'Family'),
].join('|')

const eventAuthority = event => (
  (event?.source === 'icloud' ? 2 : 0)
  + (clean(event?.sourceId) ? 1 : 0)
)

export function dedupeCalendarEvents(events) {
  const unique = new Map()
  arrayOrEmpty(events).forEach(event => {
    if (!clean(event?.title) || !clean(event?.date || event?.start)) return
    const signature = calendarEventSignature(event)
    const current = unique.get(signature)
    if (!current || eventAuthority(event) > eventAuthority(current)) unique.set(signature, event)
  })
  return [...unique.values()]
}

export function calendarEventsForDate(events, date) {
  return dedupeCalendarEvents(events).filter(event => clean(event?.date) === date)
}

export function calendarAppointmentFromEvent(event) {
  return {
    id: `icloud-${clean(event.id || event.uid || event.href)}`,
    calendarEventId: clean(event.id || event.uid),
    calendarSourceId: clean(event.sourceId),
    calendarHref: clean(event.href),
    calendarSource: 'icloud',
    readOnly: true,
    title: clean(event.title) || 'Untitled event',
    notes: 'Synced from the Apple Family Calendar.',
    date: clean(event.date),
    startTime: clean(event.time),
    endTime: '',
    allDay: Boolean(event.allDay || !event.time),
    owner: clean(event.owner) || 'Family',
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
  const existingIds = new Set(existing.map(item => clean(item?.id)).filter(Boolean))
  const signatures = new Set(existing.map(item => appointmentSignature(item, date)))
  const additions = []

  calendarEventsForDate(events, date).forEach(event => {
    if (event.sourceId && existingIds.has(clean(event.sourceId))) return
    const signature = appointmentSignature(event, date)
    if (signatures.has(signature)) return
    signatures.add(signature)
    additions.push(calendarAppointmentFromEvent(event))
  })

  return [...existing, ...additions].sort((left, right) => {
    const leftTime = timeMinutes(left.startTime)
    const rightTime = timeMinutes(right.startTime)
    if (leftTime < 0 && rightTime >= 0) return -1
    if (rightTime < 0 && leftTime >= 0) return 1
    return leftTime - rightTime || left.title.localeCompare(right.title)
  })
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

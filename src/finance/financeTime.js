export const HOUSEHOLD_TIME_ZONE = 'America/New_York'

function householdDateParts(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(now)
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
}

// A calendar-coordinate Date lets existing recurrence and range helpers use
// local Date arithmetic while anchoring the year/month/day to the household,
// not to the browser or test runner's time zone.
export function getHouseholdCalendarDate(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  const { year, month, day } = householdDateParts(now, timeZone)
  return new Date(Number(year), Number(month) - 1, Number(day))
}

export function getHouseholdDateKey(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  const { year, month, day } = householdDateParts(now, timeZone)
  return `${year}-${month}-${day}`
}

export function getHouseholdDateLabel(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday:'long',
    month:'long',
    day:'numeric',
    year:'numeric',
  }).format(now)
}

export function getHouseholdTimeLabel(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour:'numeric',
    minute:'2-digit',
  }).format(now)
}

export function getHouseholdDateTimeLabel(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month:'short',
    day:'numeric',
    year:'numeric',
    hour:'numeric',
    minute:'2-digit',
  }).format(now)
}

export function getHouseholdMinuteOfDay(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour:'numeric',
    minute:'2-digit',
    hourCycle:'h23',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return (Number(parts.hour) % 24) * 60 + Number(parts.minute)
}

export function getHouseholdGreeting(now = new Date(), timeZone = HOUSEHOLD_TIME_ZONE) {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now).find(part => part.type === 'hour')
  const hour = Number(hourPart?.value) % 24

  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

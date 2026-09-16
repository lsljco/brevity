import { HOUSEHOLD_MEMBERS } from '../homehq/projectData.js'
import { canonicalCalendarText, canonicalizeCalendarReadEvent } from './calendarNames.js'

export { canonicalCalendarText } from './calendarNames.js'

const clean = value => String(value || '').trim()

export function canonicalCalendarMember(value, fallback = 'Family') {
  const canonical = canonicalCalendarText(value).trim()
  return canonical === 'Family' || HOUSEHOLD_MEMBERS.includes(canonical) ? canonical : fallback
}

function canonicalMembers(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => canonicalCalendarMember(value, ''))
    .filter(Boolean))]
}

export function isAppleCalendarEvent(event) {
  return event?.source === 'icloud' || event?.calendarSource === 'icloud'
}

export function isBrevityManagedAppleEvent(event) {
  return isAppleCalendarEvent(event)
    && String(event?.sourceId || '').startsWith('assistant-')
    && !String(event?.id || event?.uid || '').includes('::')
}

export function calendarEventVersion(event) {
  return clean(event?.etag || event?.updatedAt)
}

export function calendarTimeInputValue(value) {
  const raw = clean(value)
  if (!raw) return ''

  const twentyFourHour = raw.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/)
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1])
    return hour <= 23 ? `${String(hour).padStart(2, '0')}:${twentyFourHour[2]}` : ''
  }

  const twelveHour = raw.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)$/i)
  if (!twelveHour) return ''
  const hour = Number(twelveHour[1])
  if (hour < 1 || hour > 12) return ''
  const period = twelveHour[3].toUpperCase()
  const convertedHour = (hour % 12) + (period === 'PM' ? 12 : 0)
  return `${String(convertedHour).padStart(2, '0')}:${twelveHour[2]}`
}

export function canEditBrevityCalendarEvent(event, access = {}) {
  if (!access.allowed || !isBrevityManagedAppleEvent(event) || !calendarEventVersion(event)) return false
  if (access.role === 'admin') return true
  const owners = [event?.owner, ...(Array.isArray(event?.participants) ? event.participants : [])].filter(Boolean)
  return owners.includes('Family') || owners.includes(access.member)
}

// Only Brevity records are normalized. Native Apple text is source data and must
// remain exactly as entered in Apple Calendar.
export function canonicalizeBrevityCalendarEvent(event = {}) {
  if (isAppleCalendarEvent(event)) return event
  const canonical = canonicalizeCalendarReadEvent(event)
  const date = clean(canonical.date || canonical.start)
  const owner = canonicalCalendarMember(canonical.owner)
  const participants = canonicalMembers(canonical.participants)
  const members = canonicalMembers(canonical.members)
  return {
    ...canonical,
    title:canonical.title.trim(),
    date,
    start:date,
    end:clean(event.end) || date,
    owner,
    participants,
    members:members.length ? members : participants,
  }
}

export function calendarPermissionForActionMode(actionMode) {
  const member = clean(actionMode?.member)
  const role = clean(actionMode?.role)
  const domains = actionMode?.permissions?.[member]
  if (!member) return { allowed:false, member:'', reason:'Brevity could not verify the signed-in household member.' }
  if (role === 'admin') return { allowed:true, member, reason:'' }
  if (domains?.calendar) return { allowed:true, member, reason:'' }
  return { allowed:false, member, reason:'Your household permissions do not allow Family Calendar changes.' }
}

const canonicalNameRules = [
  [/\bJabin\b/gi, 'Javin'],
  [/\bTarrica\b/gi, 'Terica'],
  [/\bTara\b/gi, 'Terica'],
]

export function canonicalCalendarText(value) {
  return canonicalNameRules.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || ''))
}

const canonicalList = values => Array.isArray(values) ? values.map(canonicalCalendarText) : values

// family_calendar_events_v1 contains Brevity-published read models. Native
// Apple records must retain the exact text entered in Apple Calendar.
export function canonicalizeCalendarReadEvent(event = {}) {
  if (event?.source === 'icloud' || event?.calendarSource === 'icloud') return event
  return {
    ...event,
    title:canonicalCalendarText(event.title),
    description:event.description == null ? event.description : canonicalCalendarText(event.description),
    notes:event.notes == null ? event.notes : canonicalCalendarText(event.notes),
    owner:event.owner == null ? event.owner : canonicalCalendarText(event.owner),
    participants:canonicalList(event.participants),
    members:canonicalList(event.members),
  }
}

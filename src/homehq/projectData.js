export const HOUSEHOLD_MEMBERS = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin', 'Isaiah']
export const PROJECT_STORAGE_KEY = 'homehq_items_v1'
export const FAMILY_CALENDAR_KEY = 'family_calendar_events_v1'

const RACI_KEYS = ['responsible', 'accountable', 'consulted', 'informed']

const uniqueMembers = values => [...new Set((values || []).filter(value => HOUSEHOLD_MEMBERS.includes(value)))]

export function normalizeProjectItem(item = {}) {
  const legacyAssignee = HOUSEHOLD_MEMBERS.includes(item.assignee) ? [item.assignee] : []
  const raci = {}
  RACI_KEYS.forEach(key => {
    const stored = item.raci?.[key]
    raci[key] = uniqueMembers(Array.isArray(stored) ? stored : key === 'responsible' ? legacyAssignee : [])
  })
  return { ...item, raci }
}

export function projectCalendarEvent(item) {
  const project = normalizeProjectItem(item)
  const start = project.startDate || project.due
  if (!start) return null
  const members = uniqueMembers(RACI_KEYS.flatMap(key => project.raci[key]))
  return {
    id: `project-${project.id}`,
    projectId: project.id,
    source: 'project',
    title: project.title,
    start,
    end: project.due || start,
    allDay: true,
    members: members.length ? members : ['Family'],
    owner: members.length === 1 ? members[0] : 'Family',
    calendarName: 'Family',
    calendarSyncEnabled: true,
    status: project.status,
    priority: project.priority,
    notes: project.notes || '',
    updatedAt: project.updatedAt || new Date().toISOString(),
  }
}

export function syncProjectCalendarEvents(items, existingEvents = []) {
  const nonProjectEvents = existingEvents.filter(event => event.source !== 'project')
  const projectEvents = items
    .filter(item => item.pushToFamilyCalendar)
    .map(projectCalendarEvent)
    .filter(Boolean)
  return [...nonProjectEvents, ...projectEvents]
}

export function readJson(storage, key, fallback) {
  try {
    const value = storage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(storage, key, value) {
  try {
    const serialized = JSON.stringify(value)
    storage.setItem(key, serialized)
    try { storage.setItem(`${key}_backup`, serialized) } catch {}
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

export function publishProjectEvents(storage, items) {
  const existing = readJson(storage, FAMILY_CALENDAR_KEY, [])
  const events = syncProjectCalendarEvents(items, Array.isArray(existing) ? existing : [])
  const result = writeJson(storage, FAMILY_CALENDAR_KEY, events)
  if (result.ok && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('brevity-family-calendar-updated', { detail: events }))
  }
  return { ...result, events }
}

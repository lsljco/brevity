import { FAMILY_CALENDAR_KEY, readJson, writeJson } from '../homehq/projectData.js'

export const HOUSEHOLD_MAINTENANCE_STORAGE_KEY = 'brevity_household_maintenance_v1'
export const HOUSEHOLD_OPERATIONS_SOURCE = 'household-operations'

const CORE_OWNERS = ['Javin', 'Nyla']
const task = (value) => ({ calendarEnabled: true, standard: value.details?.[0] || '', ...value })

const DAILY_TASKS = [
  task({
    id: 'daily-kitchen-reset',
    title: 'Kitchen reset',
    timing: 'After use / end of day',
    category: 'Daily reset',
    zone: 'Kitchen',
    owners: CORE_OWNERS,
    details: ['Kitchen returned to ready condition', 'Wash or load dishes', 'Wipe counters and eating surfaces', 'Put food and supplies away', 'Sweep visible debris', 'Complete an end-of-day reset'],
  }),
  task({
    id: 'daily-bedroom-reset',
    title: 'Bedroom reset',
    timing: 'Every day',
    category: 'Daily reset',
    zone: 'Bedrooms',
    owners: ['Everyone'],
    details: ['Bedrooms returned to ready condition', 'Make every bed', 'Pick up clothes and clutter', 'Return items to their places', 'Clear and reset visible surfaces', 'Leave deep cleaning for the assigned floor day'],
  }),
]

const WEEKLY_TASKS = {
  1: [task({
    id: 'monday-upstairs-balconies',
    title: 'Clean 3 upstairs balconies',
    timing: 'Before 12 PM',
    category: 'Exterior maintenance',
    zone: 'Exterior',
    owners: CORE_OWNERS,
    details: ['All three balconies inspection-ready', 'Sweep and remove debris', 'Wipe railings and doors', 'Clean furniture and reset the layout', 'Spot-clean glass and visible marks'],
  })],
  2: [task({
    id: 'tuesday-main-floor-balconies',
    title: 'Clean 2 main-floor balconies',
    timing: 'Before 12 PM',
    category: 'Exterior maintenance',
    zone: 'Exterior',
    owners: CORE_OWNERS,
    details: ['Both balconies inspection-ready', 'Sweep and remove debris', 'Wipe railings and doors', 'Clean furniture and reset the layout', 'Spot-clean glass and visible marks'],
  })],
  3: [
    task({ id: 'wednesday-porches', title: 'Clean all porches', timing: 'Before 12 PM', category: 'Exterior maintenance', zone: 'Exterior', owners: CORE_OWNERS, details: ['Every porch complete before the floor-cleaning block begins'] }),
    task({ id: 'wednesday-top-floor', title: 'Complete the top floor', timing: '12-4 PM', category: 'Floor operation', zone: 'Top Floor', owners: CORE_OWNERS, details: ['Entire top floor inspection-ready', 'Clean all upstairs bedrooms and bathrooms', 'Clean hallways, landing, and stairs', 'Dust surfaces and fixtures', 'Clean mirrors and bathroom surfaces', 'Vacuum carpets and stairs; mop hard floors', 'Empty trash and reset rooms', 'Inspect the entire floor together'] }),
    supportTask('wednesday', 'Top Floor'),
  ],
  4: [
    task({ id: 'thursday-dog-baths', title: 'Bathe Caesar and Adonis', timing: 'Before 12 PM', category: 'Pet care', zone: 'Pet Care', owners: CORE_OWNERS, details: ['Both dogs bathed and bathing area reset', 'Bathe both dogs', 'Wash towels', 'Clean and reset the bathing area'] }),
    task({ id: 'thursday-middle-floor', title: 'Complete the middle floor', timing: '12-4 PM', category: 'Floor operation', zone: 'Middle Floor', owners: CORE_OWNERS, details: ['Entire middle floor inspection-ready', 'Deep-clean the kitchen', 'Clean two main-floor bathrooms', 'Clean offices, dining, and living areas', 'Degrease and sanitize kitchen surfaces', 'Clean appliances and sinks', 'Dust offices and living spaces', 'Vacuum and mop the full floor', 'Inspect high-visibility areas'] }),
    supportTask('thursday', 'Middle Floor'),
  ],
  5: [
    task({ id: 'friday-cars', title: 'Wash both cars', timing: 'Before 12 PM', category: 'Vehicle care', zone: 'Vehicles', owners: CORE_OWNERS, details: ['Both vehicles washed before floor-cleaning begins', 'Complete both washes at the car wash before the floor-cleaning block'] }),
    task({ id: 'friday-bottom-floor', title: 'Complete the bottom floor', timing: '12-4 PM', category: 'Floor operation', zone: 'Bottom Floor', owners: CORE_OWNERS, details: ['Entire bottom floor inspection-ready', 'Clean basement bedroom, bathroom, and theater', 'Clean landing, stairs, and finished side', 'Sweep unfinished, utility, and storage areas', 'Clean the kennel area', 'Vacuum and mop; clean windows', 'Close the week with a full inspection'] }),
    supportTask('friday', 'Bottom Floor'),
  ],
}

function supportTask(day, zone) {
  return task({
    id: `${day}-isaiah-support`, title: 'Floor-operation support', timing: 'After 2 PM', category: 'Support', zone, owners: ['Isaiah'],
    details: ['Assigned floor team has requested support', 'Pick up loose items', 'Collect trash', 'Carry light supplies', 'Wipe reachable surfaces', 'Assist with simple resets'],
  })
}

export function parseMaintenanceDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function maintenanceDateKey(value) {
  const date = parseMaintenanceDate(value) || new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function maintenanceWeekStart(value = new Date()) {
  const date = parseMaintenanceDate(value) || new Date()
  const day = date.getDay()
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  return date
}

function addDays(date, amount) { const result = new Date(date); result.setDate(result.getDate() + amount); return result }

export function buildHouseholdMaintenanceWeek(anchor = new Date()) {
  const weekStart = maintenanceWeekStart(anchor)
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index)
    const dateKey = maintenanceDateKey(date)
    const templates = [...DAILY_TASKS, ...(WEEKLY_TASKS[date.getDay()] || [])]
    return {
      date: dateKey,
      label: date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
      tasks: templates.map(template => ({ ...template, owners: [...template.owners], details: [...template.details], occurrenceId: `${dateKey}:${template.id}` })),
    }
  })
}

export function householdOperationZones(days = []) {
  return ['All Zones', ...new Set(days.flatMap(day => day.tasks.map(item => item.zone).filter(Boolean)))]
}

export function normalizeHouseholdMaintenanceState(value = {}) {
  const legacy = value.completions && typeof value.completions === 'object' ? value.completions : {}
  const occurrences = value.occurrences && typeof value.occurrences === 'object' ? value.occurrences : legacy
  return {
    version: 2,
    trackingStartedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(value.trackingStartedOn || '')) ? value.trackingStartedOn : maintenanceDateKey(new Date()),
    occurrences,
    completions: occurrences,
  }
}

export function householdOccurrence(state, task) { return state.occurrences?.[task.occurrenceId] || state.completions?.[task.occurrenceId] || {} }

export function summarizeHouseholdMaintenance(days, state, today = new Date()) {
  const todayKey = maintenanceDateKey(today)
  const tasks = days.flatMap(day => day.tasks)
  const completed = tasks.filter(task => householdOccurrence(state, task).complete).length
  const exceptions = tasks.filter(task => householdOccurrence(state, task).exception).length
  const covered = tasks.filter(task => householdOccurrence(state, task).coveredBy).length
  const overdue = tasks.filter(task => {
    const taskDate = task.occurrenceId.slice(0, 10)
    return taskDate >= state.trackingStartedOn && taskDate < todayKey && !householdOccurrence(state, task).complete
  }).length
  const dueToday = tasks.filter(task => task.occurrenceId.startsWith(todayKey)).length
  return { scheduled: tasks.length, completed, overdue, dueToday, exceptions, covered }
}

export function householdOperationCalendarEvent(task, occurrence = {}) {
  const members = occurrence.coveredBy ? [occurrence.coveredBy] : task.owners.includes('Everyone') ? ['Family'] : task.owners
  return {
    id: `household-operation-${task.occurrenceId}`,
    sourceId: `household-operation-${task.occurrenceId}`,
    source: HOUSEHOLD_OPERATIONS_SOURCE,
    title: task.title,
    date: task.occurrenceId.slice(0, 10),
    start: task.occurrenceId.slice(0, 10),
    allDay: true,
    members,
    participants: members,
    owner: members.length === 1 ? members[0] : 'Family',
    calendarName: 'Family',
    calendarSyncEnabled: true,
    status: occurrence.complete ? 'Complete' : occurrence.exception ? 'Exception' : 'Scheduled',
    notes: [task.zone, task.timing, task.standard, occurrence.exception ? `Exception: ${occurrence.exception}` : ''].filter(Boolean).join(' · '),
    updatedAt: occurrence.updatedAt || new Date().toISOString(),
  }
}

export function publishHouseholdOperationEvents(storage, state, weeks = 6) {
  const start = maintenanceWeekStart(new Date())
  const tasks = []
  for (let index = 0; index < weeks; index += 1) {
    const anchor = addDays(start, index * 7)
    buildHouseholdMaintenanceWeek(anchor).forEach(day => day.tasks.forEach(item => { if (item.calendarEnabled) tasks.push(item) }))
  }
  const prior = readJson(storage, FAMILY_CALENDAR_KEY, [])
  const other = (Array.isArray(prior) ? prior : []).filter(event => event.source !== HOUSEHOLD_OPERATIONS_SOURCE)
  const events = tasks.map(item => householdOperationCalendarEvent(item, householdOccurrence(state, item)))
  const result = writeJson(storage, FAMILY_CALENDAR_KEY, [...other, ...events])
  if (result.ok && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('brevity-family-calendar-updated', { detail: events }))
  return { ...result, events }
}

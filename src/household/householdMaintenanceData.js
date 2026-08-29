export const HOUSEHOLD_MAINTENANCE_STORAGE_KEY = 'brevity_household_maintenance_v1'

const CORE_OWNERS = ['Javin', 'Nyla']
const DAILY_TASKS = [
  {
    id: 'daily-kitchen-reset',
    title: 'Kitchen reset',
    timing: 'After use / end of day',
    category: 'Daily reset',
    owners: CORE_OWNERS,
    details: ['Wash or load dishes', 'Wipe counters and eating surfaces', 'Put food and supplies away', 'Sweep visible debris', 'Complete an end-of-day reset'],
  },
  {
    id: 'daily-bedroom-reset',
    title: 'Bedroom reset',
    timing: 'Every day',
    category: 'Daily reset',
    owners: ['Everyone'],
    details: ['Make every bed', 'Pick up clothes and clutter', 'Return items to their places', 'Clear and reset visible surfaces', 'Leave deep cleaning for the assigned floor day'],
  },
]

const WEEKLY_TASKS = {
  1: [{
    id: 'monday-upstairs-balconies',
    title: 'Clean 3 upstairs balconies',
    timing: 'Before 12 PM',
    category: 'Exterior maintenance',
    owners: CORE_OWNERS,
    details: ['Sweep and remove debris', 'Wipe railings and doors', 'Clean furniture and reset the layout', 'Spot-clean glass and visible marks'],
  }],
  2: [{
    id: 'tuesday-main-floor-balconies',
    title: 'Clean 2 main-floor balconies',
    timing: 'Before 12 PM',
    category: 'Exterior maintenance',
    owners: CORE_OWNERS,
    details: ['Sweep and remove debris', 'Wipe railings and doors', 'Clean furniture and reset the layout', 'Spot-clean glass and visible marks'],
  }],
  3: [
    {
      id: 'wednesday-porches',
      title: 'Clean all porches',
      timing: 'Before 12 PM',
      category: 'Exterior maintenance',
      owners: CORE_OWNERS,
      details: ['Finish every porch before the floor-cleaning block begins'],
    },
    {
      id: 'wednesday-top-floor',
      title: 'Complete the top floor',
      timing: '12-4 PM',
      category: 'Floor operation',
      owners: CORE_OWNERS,
      details: ['Clean all upstairs bedrooms and bathrooms', 'Clean hallways, landing, and stairs', 'Dust surfaces and fixtures', 'Clean mirrors and bathroom surfaces', 'Vacuum carpets and stairs; mop hard floors', 'Empty trash and reset rooms', 'Inspect the entire floor together'],
    },
    supportTask('wednesday'),
  ],
  4: [
    {
      id: 'thursday-dog-baths',
      title: 'Bathe Caesar and Adonis',
      timing: 'Before 12 PM',
      category: 'Pet care',
      owners: CORE_OWNERS,
      details: ['Bathe both dogs', 'Wash towels', 'Clean and reset the bathing area'],
    },
    {
      id: 'thursday-middle-floor',
      title: 'Complete the middle floor',
      timing: '12-4 PM',
      category: 'Floor operation',
      owners: CORE_OWNERS,
      details: ['Deep-clean the kitchen', 'Clean two main-floor bathrooms', 'Clean offices, dining, and living areas', 'Degrease and sanitize kitchen surfaces', 'Clean appliances and sinks', 'Dust offices and living spaces', 'Vacuum and mop the full floor', 'Inspect high-visibility areas'],
    },
    supportTask('thursday'),
  ],
  5: [
    {
      id: 'friday-cars',
      title: 'Wash both cars',
      timing: 'Before 12 PM',
      category: 'Vehicle care',
      owners: CORE_OWNERS,
      details: ['Complete both washes at the car wash before the floor-cleaning block'],
    },
    {
      id: 'friday-bottom-floor',
      title: 'Complete the bottom floor',
      timing: '12-4 PM',
      category: 'Floor operation',
      owners: CORE_OWNERS,
      details: ['Clean basement bedroom, bathroom, and theater', 'Clean landing, stairs, and finished side', 'Sweep unfinished, utility, and storage areas', 'Clean the kennel area', 'Vacuum and mop; clean windows', 'Close the week with a full inspection'],
    },
    supportTask('friday'),
  ],
}

function supportTask(day) {
  return {
    id: `${day}-isaiah-support`,
    title: 'Floor-operation support',
    timing: 'After 2 PM',
    category: 'Support',
    owners: ['Isaiah'],
    details: ['Pick up loose items', 'Collect trash', 'Carry light supplies', 'Wipe reachable surfaces', 'Assist with simple resets'],
  }
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

function addDays(date, amount) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

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

export function normalizeHouseholdMaintenanceState(value = {}) {
  return {
    version: 1,
    trackingStartedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(value.trackingStartedOn || '')) ? value.trackingStartedOn : maintenanceDateKey(new Date()),
    completions: value.completions && typeof value.completions === 'object' ? value.completions : {},
  }
}

export function summarizeHouseholdMaintenance(days, state, today = new Date()) {
  const todayKey = maintenanceDateKey(today)
  const tasks = days.flatMap(day => day.tasks)
  const completed = tasks.filter(task => state.completions[task.occurrenceId]?.complete).length
  const overdue = tasks.filter(task => {
    const taskDate = task.occurrenceId.slice(0, 10)
    return taskDate >= state.trackingStartedOn && taskDate < todayKey && !state.completions[task.occurrenceId]?.complete
  }).length
  const dueToday = tasks.filter(task => task.occurrenceId.startsWith(todayKey)).length
  return { scheduled: tasks.length, completed, overdue, dueToday }
}

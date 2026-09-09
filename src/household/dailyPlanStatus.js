export const DAILY_PLAN_ITEM_STATUSES = [
  'pending',
  'needs-decision',
  'ready',
  'in-progress',
  'determined',
  'complete',
  'deferred',
]

export const DAILY_PLAN_PRIORITIES = ['critical', 'high', 'normal', 'low']
export const DAILY_PLAN_NOTIFICATION_LEVELS = ['awareness', 'action', 'critical']

const STATUS_ALIASES = new Map([
  ['not-started', 'pending'],
  ['not-yet-started', 'pending'],
  ['to-do', 'pending'],
  ['todo', 'pending'],
  ['open', 'pending'],
  ['planned', 'pending'],
  ['scheduled', 'pending'],
  ['awaiting-decision', 'needs-decision'],
  ['decision-needed', 'needs-decision'],
  ['needs-review', 'needs-decision'],
  ['active', 'in-progress'],
  ['started', 'in-progress'],
  ['completed', 'complete'],
  ['done', 'complete'],
  ['postponed', 'deferred'],
  ['decided', 'determined'],
  ['approved', 'determined'],
])

const PRIORITY_ALIASES = new Map([
  ['urgent', 'critical'],
  ['immediate', 'critical'],
  ['highest', 'critical'],
  ['important', 'high'],
  ['medium', 'normal'],
  ['moderate', 'normal'],
  ['standard', 'normal'],
  ['default', 'normal'],
  ['routine', 'normal'],
  ['minor', 'low'],
  ['lowest', 'low'],
])

const NOTIFICATION_ALIASES = new Map([
  ['none', 'awareness'],
  ['info', 'awareness'],
  ['informational', 'awareness'],
  ['passive', 'awareness'],
  ['notify', 'action'],
  ['reminder', 'action'],
  ['action-required', 'action'],
  ['high', 'critical'],
  ['urgent', 'critical'],
  ['immediate', 'critical'],
])

const token = value => String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-')

export function normalizeDailyPlanItemStatus(value, fallback = 'pending') {
  const status = token(value)
  if (!status) return fallback
  return STATUS_ALIASES.get(status) || status
}

export function normalizeDailyPlanPriority(value, fallback = 'normal') {
  const priority = token(value)
  if (!priority) return fallback
  return PRIORITY_ALIASES.get(priority) || priority
}

export function normalizeDailyPlanNotificationLevel(value, fallback = 'awareness') {
  const level = token(value)
  if (!level) return fallback
  return NOTIFICATION_ALIASES.get(level) || level
}

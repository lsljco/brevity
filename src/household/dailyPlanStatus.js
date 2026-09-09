export const DAILY_PLAN_ITEM_STATUSES = [
  'pending',
  'needs-decision',
  'ready',
  'in-progress',
  'determined',
  'complete',
  'deferred',
]

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

export function normalizeDailyPlanItemStatus(value, fallback = 'pending') {
  const status = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-')
  if (!status) return fallback
  return STATUS_ALIASES.get(status) || status
}

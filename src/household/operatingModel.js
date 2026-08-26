import { DECISION_STATUS, ITEM_STATUS, PILLAR_IDS, normalizeDailyPlan } from './dailyPlan.js'

export const OPERATING_KIND = Object.freeze({
  action: 'action',
  commitment: 'commitment',
  decision: 'decision',
  outcome: 'outcome',
  signal: 'signal',
})

export const OPERATING_SOURCE = Object.freeze({
  appleCalendar: 'apple-calendar',
  brevityCalendar: 'brevity-calendar',
  dailyPlan: 'daily-plan',
  integration: 'integration',
})

const arrayOrEmpty = value => Array.isArray(value) ? value : []
const clean = value => String(value || '').trim()
const priorityScore = { critical: 0, high: 1, normal: 2, low: 3 }
const unresolved = status => status !== ITEM_STATUS.complete && status !== ITEM_STATUS.deferred

const timeMinutes = value => {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]?.toUpperCase()
  if (hour > 23 || minute > 59) return null
  if (meridiem === 'PM' && hour < 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
}

const dateTimeFor = (dateKey, time) => {
  const minutes = timeMinutes(time)
  if (minutes === null) return ''
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mins = String(minutes % 60).padStart(2, '0')
  return `${dateKey}T${hours}:${mins}:00`
}

const source = (system, recordType, recordId, extra = {}) => ({ system, recordType, recordId, ...extra })

export function createOperatingRecord({
  id,
  kind,
  title,
  detail = '',
  owner = 'Family',
  participants = [],
  state = ITEM_STATUS.pending,
  priority = 'normal',
  dueAt = '',
  startsAt = '',
  source: recordSource,
  sourceIndex = null,
  pillar = '',
} = {}) {
  if (!Object.values(OPERATING_KIND).includes(kind)) throw new Error(`Unsupported operating record kind: ${kind || 'missing'}`)
  if (!clean(title)) throw new Error('Operating records require a title.')
  return {
    id: clean(id) || `${kind}-${clean(recordSource?.recordId)}`,
    kind,
    title: clean(title),
    detail: clean(detail),
    owner: clean(owner) || 'Family',
    participants: arrayOrEmpty(participants),
    state: clean(state) || ITEM_STATUS.pending,
    priority: priorityScore[priority] === undefined ? 'normal' : priority,
    dueAt: clean(dueAt),
    startsAt: clean(startsAt),
    source: recordSource || source(OPERATING_SOURCE.dailyPlan, kind, clean(id)),
    sourceIndex,
    pillar: clean(pillar),
  }
}

const recordFromPlanItem = (item, kind, recordType, sourceIndex, planDate) => createOperatingRecord({
  id: item.id || `${recordType}-${sourceIndex}`,
  kind,
  title: item.title || `${kind} ${sourceIndex + 1}`,
  detail: item.notes,
  owner: item.owner,
  participants: item.participants,
  state: item.status,
  priority: item.priority,
  dueAt: item.dueAt,
  startsAt: dateTimeFor(item.date || planDate, item.startTime || item.time),
  source: source(OPERATING_SOURCE.dailyPlan, recordType, item.id || `${recordType}-${sourceIndex}`),
  sourceIndex,
  pillar: item.pillar,
})

const appointmentRecord = (item, index, planDate, calendarHealth) => {
  const sourceSystem = item.calendarSource === 'icloud' ? OPERATING_SOURCE.appleCalendar : OPERATING_SOURCE.brevityCalendar
  return createOperatingRecord({
    id: item.id || `commitment-${index}`,
    kind: OPERATING_KIND.commitment,
    title: item.title || 'Untitled calendar commitment',
    detail: item.notes,
    owner: item.owner,
    participants: item.participants,
    state: item.status,
    priority: item.priority,
    startsAt: dateTimeFor(item.date || planDate, item.startTime || item.time),
    source: source(sourceSystem, 'calendar-event', item.calendarEventId || item.id || `commitment-${index}`, {
      freshness: sourceSystem === OPERATING_SOURCE.appleCalendar ? calendarHealth?.state || 'unknown' : 'current',
      lastVerifiedAt: sourceSystem === OPERATING_SOURCE.appleCalendar ? calendarHealth?.lastSuccessfulSyncAt || '' : '',
    }),
    sourceIndex: index,
    pillar: item.pillar || 'household',
  })
}

const integrationSignal = calendarHealth => {
  if (!calendarHealth || calendarHealth.state === 'ready' || calendarHealth.state === 'loading') return null
  const noFallback = !calendarHealth.usable
  const priority = noFallback || ['error', 'locked', 'unconfigured'].includes(calendarHealth.state) ? 'critical' : 'high'
  return createOperatingRecord({
    id: 'signal-calendar-health',
    kind: OPERATING_KIND.signal,
    title: noFallback ? 'Today’s calendar is not verified' : 'Today’s calendar may be out of date',
    detail: calendarHealth.message,
    owner: 'Family',
    priority,
    state: 'needs-attention',
    source: source(OPERATING_SOURCE.integration, 'calendar-health', 'apple-family-calendar', {
      freshness: calendarHealth.state,
      lastVerifiedAt: calendarHealth.lastSuccessfulSyncAt || '',
    }),
    pillar: 'household',
  })
}

const planSignals = plan => [
  !plan.health.dinner && createOperatingRecord({
    id: 'signal-meal-dinner', kind: OPERATING_KIND.signal, title: 'Dinner is not resolved',
    detail: 'Choose tonight’s dinner before the household day becomes busy.', owner: 'Family', priority: 'high',
    state: 'needs-attention', source: source(OPERATING_SOURCE.dailyPlan, 'health-plan', plan.id), pillar: 'health',
  }),
  !plan.fitness.location && createOperatingRecord({
    id: 'signal-fitness-location', kind: OPERATING_KIND.signal, title: 'Workout location is not determined',
    detail: 'Confirm where the household workout will happen.', owner: 'Larry', priority: 'high',
    state: 'needs-attention', source: source(OPERATING_SOURCE.dailyPlan, 'fitness-plan', plan.id), pillar: 'fitness',
  }),
  !plan.education.isaiah.owner && createOperatingRecord({
    id: 'signal-education-owner', kind: OPERATING_KIND.signal, title: 'Isaiah’s education block has no owner',
    detail: 'Assign the adult responsible for today’s learning block.', owner: 'Family', priority: 'high',
    state: 'needs-attention', source: source(OPERATING_SOURCE.dailyPlan, 'education-plan', plan.id), pillar: 'education',
  }),
].filter(Boolean)

const pillarPulse = (plan, commitments, signals) => {
  const signalCount = pillar => signals.filter(item => item.pillar === pillar).length
  const details = {
    spiritual: plan.spiritual.devotionFocus || 'Devotion focus is not set',
    health: plan.health.dinner ? 'Meals are planned' : 'Dinner needs attention',
    fitness: plan.fitness.location ? `Workout: ${plan.fitness.location}` : 'Workout location needs attention',
    household: commitments.length ? `${commitments.length} calendar commitment${commitments.length === 1 ? '' : 's'}` : 'No verified commitments today',
    education: plan.education.isaiah.owner ? `Learning owner: ${plan.education.isaiah.owner}` : 'Learning owner needs attention',
    finance: plan.finance.accountsToFund.length ? `${plan.finance.accountsToFund.length} funding action${plan.finance.accountsToFund.length === 1 ? '' : 's'}` : 'No funding exceptions in today’s plan',
    ministry: plan.ministry.meetings.length ? `${plan.ministry.meetings.length} ministry commitment${plan.ministry.meetings.length === 1 ? '' : 's'}` : 'No ministry exception in today’s plan',
  }
  return PILLAR_IDS.map(pillar => ({
    pillar,
    state: signalCount(pillar) ? 'attention' : 'ready',
    attentionCount: signalCount(pillar),
    summary: details[pillar],
  }))
}

const byPriorityThenTime = (left, right) => {
  const priority = priorityScore[left.priority] - priorityScore[right.priority]
  if (priority) return priority
  if (left.startsAt && right.startsAt) return left.startsAt.localeCompare(right.startsAt)
  if (left.startsAt) return -1
  if (right.startsAt) return 1
  return left.title.localeCompare(right.title)
}

const decisionStateScore = {
  [DECISION_STATUS.needsDecision]: 0,
  [DECISION_STATUS.determined]: 1,
}

export function buildTodayReadModel({ plan, calendarAppointments = [], calendarHealth, currentMember = 'Larry', now = new Date() }) {
  const normalized = normalizeDailyPlan(plan)
  const commitments = calendarAppointments.map((item, index) => appointmentRecord(item, index, normalized.date, calendarHealth))
  const decisions = normalized.decisions
    .map((item, index) => recordFromPlanItem(item, OPERATING_KIND.decision, 'decision', index, normalized.date))
    .filter(item => item.state !== DECISION_STATUS.complete && item.state !== DECISION_STATUS.deferred)
    .sort((left, right) => (decisionStateScore[left.state] ?? 2) - (decisionStateScore[right.state] ?? 2) || byPriorityThenTime(left, right))
  const actions = normalized.assignments
    .map((item, index) => recordFromPlanItem(item, OPERATING_KIND.action, 'assignment', index, normalized.date))
    .filter(item => unresolved(item.state))
    .filter(item => item.owner === currentMember || item.participants.includes(currentMember))
    .sort(byPriorityThenTime)
  const outcomes = normalized.topPriorities.slice(0, 3).map((item, index) => recordFromPlanItem(item, OPERATING_KIND.outcome, 'top-priority', index, normalized.date))
  const signals = [...planSignals(normalized), integrationSignal(calendarHealth)].filter(Boolean).sort(byPriorityThenTime)
  const localNowDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const nextCommitment = normalized.date === localNowDate
    ? commitments.find(item => item.startsAt && new Date(item.startsAt).getTime() >= now.getTime())
      || commitments.find(item => !item.startsAt)
      || commitments[0]
      || null
    : commitments[0] || null

  return {
    date: normalized.date,
    generatedAt: now.toISOString(),
    theme: normalized.theme,
    objective: normalized.dayObjective,
    governingPrinciple: normalized.governingPrinciple,
    signals,
    criticalSignals: signals.filter(item => item.priority === 'critical'),
    nextCommitment,
    commitments,
    outcomes,
    actions,
    decisions,
    pillarPulse: pillarPulse(normalized, commitments, signals),
    schedule: arrayOrEmpty(normalized.dayparts),
    counts: {
      signals: signals.length,
      actions: actions.length,
      decisions: decisions.length,
      commitments: commitments.length,
    },
  }
}

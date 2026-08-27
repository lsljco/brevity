export const HOUSEHOLD_MEMBERS = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin', 'Isaiah']

export const PILLAR_IDS = [
  'spiritual',
  'health',
  'fitness',
  'household',
  'education',
  'finance',
  'ministry',
]

export const DAILY_PLAN_STORAGE_KEY = 'brevity_daily_plans_v1'
export const DEFAULT_FITNESS_LOCATION = 'Lifetime Gym'
export const DEFAULT_EDUCATION_OWNER = 'Family'

export const ITEM_STATUS = {
  pending: 'pending',
  needsDecision: 'needs-decision',
  ready: 'ready',
  inProgress: 'in-progress',
  complete: 'complete',
  deferred: 'deferred',
}

export const DECISION_STATUS = {
  needsDecision: 'needs-decision',
  determined: 'determined',
  complete: 'complete',
  deferred: 'deferred',
}

export const DECISION_STATUS_OPTIONS = [
  { value: DECISION_STATUS.needsDecision, label: 'Needs Decision' },
  { value: DECISION_STATUS.determined, label: 'Determined' },
  { value: DECISION_STATUS.complete, label: 'Complete' },
  { value: DECISION_STATUS.deferred, label: 'Deferred' },
]

export const NOTIFICATION_LEVEL = {
  awareness: 'awareness',
  action: 'action',
  critical: 'critical',
}

const arrayOrEmpty = value => Array.isArray(value) ? value : []
const objectOrEmpty = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const makeId = () => globalThis.crypto?.randomUUID?.() || `brevity-${Date.now()}-${Math.random().toString(36).slice(2)}`
const localDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function normalizeDecisionStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  if (status === DECISION_STATUS.complete) return DECISION_STATUS.complete
  if (status === DECISION_STATUS.deferred) return DECISION_STATUS.deferred
  if (status === DECISION_STATUS.determined || status === ITEM_STATUS.ready || status === ITEM_STATUS.inProgress) return DECISION_STATUS.determined
  return DECISION_STATUS.needsDecision
}

const normalizeDecision = decision => decision && typeof decision === 'object' && !Array.isArray(decision)
  ? { ...decision, status: normalizeDecisionStatus(decision.status) }
  : decision

export function isStandingRoutineDecision(decision) {
  const text = String(typeof decision === 'string' ? decision : decision?.title || '').trim().toLowerCase()
  const gymLocationDecision = /(gym|life\s*time|lifetime|workout)/.test(text) && /(where|which|location)/.test(text)
  const educationOwnerDecision = /(isaiah|education block|learning block)/.test(text) && /(who|owner|accountable|responsib|supervis)/.test(text)
  return gymLocationDecision || educationOwnerDecision
}

const normalizeFitnessLocation = value => {
  const location = String(value || '').trim()
  if (!location || /^life\s*time\b|^lifetime\b/i.test(location)) return DEFAULT_FITNESS_LOCATION
  return location
}

export function createPlanItem(overrides = {}) {
  return {
    id: overrides.id || makeId(),
    title: '',
    notes: '',
    owner: 'Family',
    participants: [],
    status: ITEM_STATUS.pending,
    priority: 'normal',
    startTime: '',
    endTime: '',
    dueAt: '',
    requiresDecision: false,
    calendarSync: false,
    notificationLevel: NOTIFICATION_LEVEL.awareness,
    ...overrides,
    participants: arrayOrEmpty(overrides.participants),
  }
}

export function createEmptyDailyPlan(date) {
  return {
    id: `daily-plan-${date}`,
    date,
    theme: '',
    governingPrinciple: '',
    successStandard: '',
    topPriorities: [],
    morningAlignment: {
      startTime: '04:45',
      completedAt: '',
      notes: '',
    },
    spiritual: {
      owner: 'Lorenzo',
      scripture: [],
      devotionFocus: '',
      prayerFocus: [],
      discussionPrompts: [],
      obedienceAction: '',
    },
    health: {
      owner: 'Terica',
      breakfast: '',
      lunch: '',
      dinner: '',
      snacks: '',
      hydration: '',
      groceries: [],
      nextDayPrep: '',
    },
    fitness: {
      owner: 'Larry',
      location: DEFAULT_FITNESS_LOCATION,
      participants: [],
      workout: '',
      objective: '',
      departureTime: '',
      returnTime: '',
      stepGoal: 12000,
      recovery: '',
      requiresDecision: false,
    },
    household: {
      owner: 'Larry',
      appointments: [],
      priorities: [],
      errands: [],
      openItems: [],
    },
    education: {
      owner: 'Larry',
      thinkTankTopic: '',
      thinkTankDeliverable: '',
      isaiah: {
        owner: DEFAULT_EDUCATION_OWNER,
        readingMinutes: 20,
        sightWordsMinutes: 10,
        comprehensionMinutes: 10,
        mathMinutes: 10,
        notes: '',
      },
    },
    finance: {
      owner: 'Larry',
      bills: [],
      purchases: [],
      transfers: [],
      accountsToFund: [],
      incomePipeline: [],
      decisionRule: '',
    },
    ministry: {
      owners: ['Larry', 'Lorenzo'],
      meetings: [],
      contentFocus: '',
      fellowshipFollowUps: [],
      prayerNeeds: [],
    },
    assignments: [],
    decisions: [],
    recap: {
      wins: [],
      carryovers: [],
      lessons: [],
      tomorrowPrep: [],
      completedAt: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeDailyPlan(input = {}) {
  const plan = objectOrEmpty(input)
  const date = typeof plan.date === 'string' && plan.date ? plan.date : localDateKey(new Date())
  const base = createEmptyDailyPlan(date)
  const morningAlignment = objectOrEmpty(plan.morningAlignment)
  const spiritual = objectOrEmpty(plan.spiritual)
  const health = objectOrEmpty(plan.health)
  const fitness = objectOrEmpty(plan.fitness)
  const household = objectOrEmpty(plan.household)
  const education = objectOrEmpty(plan.education)
  const finance = objectOrEmpty(plan.finance)
  const ministry = objectOrEmpty(plan.ministry)
  const recap = objectOrEmpty(plan.recap)

  return {
    ...base,
    ...plan,
    date,
    topPriorities: arrayOrEmpty(plan.topPriorities),
    assignments: arrayOrEmpty(plan.assignments),
    decisions: arrayOrEmpty(plan.decisions).filter(decision => !isStandingRoutineDecision(decision)).map(normalizeDecision),
    morningAlignment: { ...base.morningAlignment, ...morningAlignment },
    spiritual: {
      ...base.spiritual,
      ...spiritual,
      owner: 'Lorenzo',
      scripture: arrayOrEmpty(spiritual.scripture),
      prayerFocus: arrayOrEmpty(spiritual.prayerFocus),
      discussionPrompts: arrayOrEmpty(spiritual.discussionPrompts),
    },
    health: {
      ...base.health,
      ...health,
      groceries: arrayOrEmpty(health.groceries),
    },
    fitness: {
      ...base.fitness,
      ...fitness,
      location: normalizeFitnessLocation(fitness.location),
      requiresDecision: false,
      participants: arrayOrEmpty(fitness.participants),
    },
    household: {
      ...base.household,
      ...household,
      appointments: arrayOrEmpty(household.appointments),
      priorities: arrayOrEmpty(household.priorities),
      errands: arrayOrEmpty(household.errands),
      openItems: arrayOrEmpty(household.openItems),
    },
    education: {
      ...base.education,
      ...education,
      isaiah: { ...base.education.isaiah, ...objectOrEmpty(education.isaiah), owner: DEFAULT_EDUCATION_OWNER },
    },
    finance: {
      ...base.finance,
      ...finance,
      bills: arrayOrEmpty(finance.bills),
      purchases: arrayOrEmpty(finance.purchases),
      transfers: arrayOrEmpty(finance.transfers),
      accountsToFund: arrayOrEmpty(finance.accountsToFund),
      incomePipeline: arrayOrEmpty(finance.incomePipeline),
    },
    ministry: {
      ...base.ministry,
      ...ministry,
      owners: arrayOrEmpty(ministry.owners).length ? arrayOrEmpty(ministry.owners) : base.ministry.owners,
      meetings: arrayOrEmpty(ministry.meetings),
      fellowshipFollowUps: arrayOrEmpty(ministry.fellowshipFollowUps),
      prayerNeeds: arrayOrEmpty(ministry.prayerNeeds),
    },
    recap: {
      ...base.recap,
      ...recap,
      wins: arrayOrEmpty(recap.wins),
      carryovers: arrayOrEmpty(recap.carryovers),
      lessons: arrayOrEmpty(recap.lessons),
      tomorrowPrep: arrayOrEmpty(recap.tomorrowPrep),
    },
    updatedAt: typeof plan.updatedAt === 'string' && plan.updatedAt ? plan.updatedAt : new Date().toISOString(),
  }
}

export function countOpenDecisions(plan) {
  const normalized = normalizeDailyPlan(plan)
  return normalized.decisions.filter(decision => decision?.status !== DECISION_STATUS.complete && decision?.status !== DECISION_STATUS.deferred).length
}

export function assignmentsForMember(plan, member) {
  const normalized = normalizeDailyPlan(plan)
  return normalized.assignments.filter(item => item && (item.owner === member || arrayOrEmpty(item.participants).includes(member)))
}

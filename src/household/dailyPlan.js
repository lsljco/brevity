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

export const ITEM_STATUS = {
  pending: 'pending',
  needsDecision: 'needs-decision',
  ready: 'ready',
  inProgress: 'in-progress',
  complete: 'complete',
  deferred: 'deferred',
}

export const NOTIFICATION_LEVEL = {
  awareness: 'awareness',
  action: 'action',
  critical: 'critical',
}

export function createPlanItem(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
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
      owner: 'Larry',
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
      location: '',
      participants: [],
      workout: '',
      objective: '',
      departureTime: '',
      returnTime: '',
      stepGoal: 12000,
      recovery: '',
      requiresDecision: true,
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
        owner: '',
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

export function normalizeDailyPlan(plan = {}) {
  const base = createEmptyDailyPlan(plan.date || new Date().toISOString().slice(0, 10))
  return {
    ...base,
    ...plan,
    morningAlignment: { ...base.morningAlignment, ...plan.morningAlignment },
    spiritual: { ...base.spiritual, ...plan.spiritual },
    health: { ...base.health, ...plan.health },
    fitness: { ...base.fitness, ...plan.fitness },
    household: { ...base.household, ...plan.household },
    education: {
      ...base.education,
      ...plan.education,
      isaiah: { ...base.education.isaiah, ...plan.education?.isaiah },
    },
    finance: { ...base.finance, ...plan.finance },
    ministry: { ...base.ministry, ...plan.ministry },
    recap: { ...base.recap, ...plan.recap },
    updatedAt: plan.updatedAt || new Date().toISOString(),
  }
}

export function countOpenDecisions(plan) {
  const normalized = normalizeDailyPlan(plan)
  return normalized.decisions.filter(decision => decision.status !== ITEM_STATUS.complete && decision.status !== ITEM_STATUS.deferred).length
}

export function assignmentsForMember(plan, member) {
  const normalized = normalizeDailyPlan(plan)
  return normalized.assignments.filter(item => item.owner === member || item.participants?.includes(member))
}

import { HOUSEHOLD_MEMBERS, normalizeDailyPlan } from './dailyPlan.js'

const text = (value, limit = 500) => String(value || '').trim().slice(0, limit)
const textList = (value, limit = 40) => Array.isArray(value) ? value.map(item => text(item)).filter(Boolean).slice(0, limit) : []
const memberList = value => Array.isArray(value) ? value.filter(member => HOUSEHOLD_MEMBERS.includes(member)) : []
const titled = (value, prefix, status = 'pending') => textList(value).map((title, index) => ({ id:`${prefix}-${index}`, title, status }))

export function normalizeAlignmentMeetingResult(input = {}) {
  const changes = input?.changes && typeof input.changes === 'object' && !Array.isArray(input.changes) ? input.changes : {}
  const section = name => changes[name] && typeof changes[name] === 'object' && !Array.isArray(changes[name]) ? changes[name] : {}
  const spiritual = section('spiritual'), health = section('health'), fitness = section('fitness'), household = section('household')
  const education = section('education'), finance = section('finance'), ministry = section('ministry')
  return {
    summary:text(input.summary, 1800),
    unresolved:textList(input.unresolved, 20),
    changes:{
      spiritual:{scripture:textList(spiritual.scripture),devotionFocus:text(spiritual.devotionFocus),prayerFocus:textList(spiritual.prayerFocus),obedienceAction:text(spiritual.obedienceAction)},
      health:{breakfast:text(health.breakfast),lunch:text(health.lunch),dinner:text(health.dinner),snacks:text(health.snacks),hydration:text(health.hydration),groceries:textList(health.groceries),nextDayPrep:text(health.nextDayPrep)},
      fitness:{location:text(fitness.location),participants:memberList(fitness.participants),workout:text(fitness.workout),objective:text(fitness.objective),departureTime:text(fitness.departureTime, 10),returnTime:text(fitness.returnTime, 10),stepGoal:Number.isFinite(Number(fitness.stepGoal)) ? Number(fitness.stepGoal) : 0,recovery:text(fitness.recovery)},
      household:{priorities:textList(household.priorities),errands:textList(household.errands),openItems:textList(household.openItems)},
      education:{thinkTankTopic:text(education.thinkTankTopic),thinkTankDeliverable:text(education.thinkTankDeliverable),isaiahNotes:text(education.isaiahNotes)},
      finance:{bills:textList(finance.bills),purchases:textList(finance.purchases),transfers:textList(finance.transfers),accountsToFund:textList(finance.accountsToFund),decisionRule:text(finance.decisionRule)},
      ministry:{contentFocus:text(ministry.contentFocus),fellowshipFollowUps:textList(ministry.fellowshipFollowUps),prayerNeeds:textList(ministry.prayerNeeds)},
    },
  }
}

const hasText = value => typeof value === 'string' && value.length > 0
const hasList = value => Array.isArray(value) && value.length > 0

export function applyAlignmentMeetingResult(planInput, resultInput, { financeReadOnly = false } = {}) {
  const plan = normalizeDailyPlan(planInput), result = normalizeAlignmentMeetingResult(resultInput), changes = result.changes
  const merge = (current, patch) => ({...current,...Object.fromEntries(Object.entries(patch).filter(([,value]) => hasText(value) || hasList(value) || (typeof value === 'number' && value > 0)))})
  const next = {
    ...plan,
    spiritual:merge(plan.spiritual, changes.spiritual),
    health:merge(plan.health, changes.health),
    fitness:merge(plan.fitness, changes.fitness),
    household:merge(plan.household, {
      priorities:hasList(changes.household.priorities) ? titled(changes.household.priorities, 'household-priority') : [],
      errands:changes.household.errands,
      openItems:changes.household.openItems,
    }),
    education:merge(plan.education, {
      thinkTankTopic:changes.education.thinkTankTopic,
      thinkTankDeliverable:changes.education.thinkTankDeliverable,
      ...(hasText(changes.education.isaiahNotes) ? {isaiah:{...plan.education.isaiah,notes:changes.education.isaiahNotes}} : {}),
    }),
    ministry:merge(plan.ministry, {
      contentFocus:changes.ministry.contentFocus,
      fellowshipFollowUps:hasList(changes.ministry.fellowshipFollowUps) ? titled(changes.ministry.fellowshipFollowUps, 'fellowship') : [],
      prayerNeeds:changes.ministry.prayerNeeds,
    }),
    updatedAt:new Date().toISOString(),
  }
  if (!financeReadOnly) next.finance = merge(plan.finance, {
    bills:hasList(changes.finance.bills) ? titled(changes.finance.bills, 'bill') : [],
    purchases:hasList(changes.finance.purchases) ? titled(changes.finance.purchases, 'purchase', 'needs-decision') : [],
    transfers:hasList(changes.finance.transfers) ? titled(changes.finance.transfers, 'transfer') : [],
    accountsToFund:hasList(changes.finance.accountsToFund) ? titled(changes.finance.accountsToFund, 'fund', 'needs-decision') : [],
    decisionRule:changes.finance.decisionRule,
  })
  return normalizeDailyPlan(next)
}

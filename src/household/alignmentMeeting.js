import { HOUSEHOLD_MEMBERS, normalizeDailyPlan } from './dailyPlan.js'

const text = (value, limit = 500) => String(value || '').trim().slice(0, limit)
const textList = (value, limit = 40) => Array.isArray(value) ? value.map(item => text(item)).filter(Boolean).slice(0, limit) : []
const memberList = value => Array.isArray(value) ? value.filter(member => HOUSEHOLD_MEMBERS.includes(member)) : []
// Transcript proposals add work without rewriting existing identity, ownership or completion.
export function mergeMeetingItems(existing=[],titles=[],prefix='meeting'){
 const rows=existing.map(row=>({...row})),key=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase()
 const seen=new Set(rows.map(row=>key(row.title)))
 for(const title of textList(titles)){if(seen.has(key(title)))continue;seen.add(key(title));let hash=2166136261;for(const ch of key(title))hash=Math.imul(hash^ch.charCodeAt(0),16777619);let id=`${prefix}-${(hash>>>0).toString(36)}`;while(rows.some(row=>row.id===id))id+='-new';rows.push({id,title,status:'pending',owner:'Family',requiresDecision:true})}
 return rows
}
export const alignmentAnalysisKey=({plan,transcript,notes,meetingId})=>JSON.stringify({plan,transcript,notes,meetingId})


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
      priorities:hasList(changes.household.priorities) ? mergeMeetingItems(plan.topPriorities.length?plan.topPriorities:plan.household.priorities, changes.household.priorities, 'household-priority') : [],
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
      fellowshipFollowUps:hasList(changes.ministry.fellowshipFollowUps) ? mergeMeetingItems(plan.ministry.fellowshipFollowUps, changes.ministry.fellowshipFollowUps, 'fellowship') : [],
      prayerNeeds:changes.ministry.prayerNeeds,
    }),
    updatedAt:new Date().toISOString(),
  }
  if (!financeReadOnly) next.finance = merge(plan.finance, {
    bills:hasList(changes.finance.bills) ? mergeMeetingItems(plan.finance.bills, changes.finance.bills, 'bill') : [],
    purchases:hasList(changes.finance.purchases) ? mergeMeetingItems(plan.finance.purchases, changes.finance.purchases, 'purchase') : [],
    transfers:hasList(changes.finance.transfers) ? mergeMeetingItems(plan.finance.transfers, changes.finance.transfers, 'transfer') : [],
    accountsToFund:hasList(changes.finance.accountsToFund) ? mergeMeetingItems(plan.finance.accountsToFund, changes.finance.accountsToFund, 'fund') : [],
    decisionRule:changes.finance.decisionRule,
  })
  if(hasList(changes.household.priorities))next.topPriorities=next.household.priorities
  return normalizeDailyPlan(next)
}

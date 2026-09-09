import { DAILY_PLAN_ITEM_STATUSES, normalizeDailyPlanItemStatus } from '../../src/household/dailyPlanStatus.js'

const MEMBERS = new Set(['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin', 'Isaiah', 'Family'])
export const DAILY_PLAN_PILLARS = ['spiritual', 'health', 'fitness', 'household', 'education', 'finance', 'ministry']

const clean = (value, max = 1000) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value)
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))

function assertObject(value, label) {
  if (!plainObject(value)) throw new Error(`${label} must be an object.`)
}

function rejectUnsupported(value, allowed, label) {
  const unsupported = Object.keys(value).find(field => !allowed.includes(field))
  if (unsupported) throw new Error(`${label} contains an unsupported field: ${unsupported}.`)
}

function strings(value, label, maxItems = 40) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} must be a list with no more than ${maxItems} items.`)
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new Error(`${label} item ${index + 1} must be text.`)
    return clean(item, 1000)
  }).filter(Boolean)
}

function members(value, label) {
  const result = strings(value, label, 12)
  if (result.some(member => !MEMBERS.has(member) || member === 'Family')) throw new Error(`${label} contains an unrecognized household member.`)
  return [...new Set(result)]
}

const ITEM_FIELDS = ['id', 'title', 'notes', 'owner', 'participants', 'status', 'priority', 'date', 'startTime', 'endTime', 'dueAt', 'requiresDecision', 'calendarSync', 'notificationLevel']
const ITEM_STATUSES = new Set(DAILY_PLAN_ITEM_STATUSES)
const PRIORITIES = new Set(['critical', 'high', 'normal', 'low'])
const NOTIFICATION_LEVELS = new Set(['awareness', 'action', 'critical'])

function planItem(value, index, label) {
  assertObject(value, `${label} item ${index + 1}`)
  rejectUnsupported(value, ITEM_FIELDS, `${label} item ${index + 1}`)
  const result = {}
  for (const [field, raw] of Object.entries(value)) {
    if (['requiresDecision', 'calendarSync'].includes(field)) {
      if (typeof raw !== 'boolean') throw new Error(`${label} item ${index + 1} requires ${field} to be true or false.`)
      result[field] = raw
    } else if (field === 'participants') result.participants = members(raw, `${label} participants`)
    else {
      if (typeof raw !== 'string') throw new Error(`${label} item ${index + 1} requires ${field} to be text.`)
      result[field] = field === 'status' ? normalizeDailyPlanItemStatus(raw, '') : clean(raw, field === 'notes' ? 3000 : 500)
    }
  }
  if (!result.title) throw new Error(`${label} item ${index + 1} requires a title.`)
  if (result.owner && !MEMBERS.has(result.owner)) throw new Error(`${label} item ${index + 1} has an unrecognized owner.`)
  if (result.status && !ITEM_STATUSES.has(result.status)) throw new Error(`${label} item ${index + 1} has an invalid status.`)
  if (result.priority && !PRIORITIES.has(result.priority)) throw new Error(`${label} item ${index + 1} has an invalid priority.`)
  if (result.notificationLevel && !NOTIFICATION_LEVELS.has(result.notificationLevel)) throw new Error(`${label} item ${index + 1} has an invalid notification level.`)
  if (result.date && !validDate(result.date)) throw new Error(`${label} item ${index + 1} has an invalid date.`)
  return result
}

function planItems(value, label, maxItems = 40) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} must be a list with no more than ${maxItems} items.`)
  return value.map((item, index) => planItem(item, index, label))
}

function isaiah(value) {
  assertObject(value, 'The Isaiah education patch')
  const allowed = ['readingMinutes', 'sightWordsMinutes', 'comprehensionMinutes', 'mathMinutes', 'notes']
  rejectUnsupported(value, allowed, 'The Isaiah education patch')
  const result = {}
  for (const [field, raw] of Object.entries(value)) {
    if (field === 'notes') {
      if (typeof raw !== 'string') throw new Error('Isaiah notes must be text.')
      result.notes = clean(raw, 3000)
    } else {
      if (!Number.isFinite(raw) || raw < 0 || raw > 1440) throw new Error(`Isaiah ${field} must be a valid number of minutes.`)
      result[field] = raw
    }
  }
  return result
}

const PILLAR_FIELDS = {
  spiritual: { text:['devotionFocus', 'obedienceAction', 'requiredOutput'], strings:['scripture', 'prayerFocus', 'discussionPrompts'] },
  health: { text:['breakfast', 'lunch', 'dinner', 'snacks', 'hydration', 'nextDayPrep', 'discussionPrompt'], strings:['groceries'] },
  fitness: { text:['location', 'workout', 'objective', 'departureTime', 'returnTime', 'recovery', 'discussionPrompt'], members:['participants'], numbers:['stepGoal'], booleans:['requiresDecision'] },
  household: { text:['keyFocus'], strings:['errands', 'openItems', 'careerPriorities'], items:['appointments', 'priorities'] },
  education: { text:['thinkTankTopic', 'thinkTankDeliverable'], strings:['discussionPrompts'], nested:['isaiah'] },
  finance: { text:['decisionRule', 'discussionPrompt', 'requiredOutput'], strings:['incomePipeline'], items:['bills', 'purchases', 'transfers', 'accountsToFund'] },
  ministry: { text:['contentFocus', 'framework'], strings:['prayerNeeds', 'readinessChecklist'], items:['meetings', 'fellowshipFollowUps'] },
}

function pillarPatch(pillar, value) {
  if (!DAILY_PLAN_PILLARS.includes(pillar)) throw new Error('Choose a recognized daily-plan pillar.')
  assertObject(value, `The ${pillar} plan patch`)
  const fields = PILLAR_FIELDS[pillar]
  const allowed = Object.values(fields).flat()
  rejectUnsupported(value, allowed, `The ${pillar} plan patch`)
  const result = {}
  for (const [field, raw] of Object.entries(value)) {
    if (fields.text?.includes(field)) {
      if (typeof raw !== 'string') throw new Error(`The ${pillar} ${field} value must be text.`)
      result[field] = clean(raw, 3000)
    } else if (fields.strings?.includes(field)) result[field] = strings(raw, `The ${pillar} ${field} list`)
    else if (fields.members?.includes(field)) result[field] = members(raw, `The ${pillar} ${field} list`)
    else if (fields.items?.includes(field)) result[field] = planItems(raw, `The ${pillar} ${field} list`)
    else if (fields.numbers?.includes(field)) {
      if (!Number.isFinite(raw) || raw < 0 || raw > 1_000_000) throw new Error(`The ${pillar} ${field} value must be a valid non-negative number.`)
      result[field] = raw
    } else if (fields.booleans?.includes(field)) {
      if (typeof raw !== 'boolean') throw new Error(`The ${pillar} ${field} value must be true or false.`)
      result[field] = raw
    } else if (field === 'isaiah') result.isaiah = isaiah(raw)
  }
  if (!Object.keys(result).length) throw new Error(`The ${pillar} plan patch does not contain a reviewed change.`)
  return result
}

function timelineItems(value, label) {
  if (!Array.isArray(value) || value.length > 40) throw new Error(`${label} must be a list with no more than 40 items.`)
  return value.map((item, index) => {
    assertObject(item, `${label} item ${index + 1}`)
    rejectUnsupported(item, ['time', 'title', 'owner', 'pillar'], `${label} item ${index + 1}`)
    const result = Object.fromEntries(Object.entries(item).map(([field, raw]) => {
      if (typeof raw !== 'string') throw new Error(`${label} item ${index + 1} requires ${field} to be text.`)
      return [field, clean(raw, 500)]
    }))
    if (!result.title) throw new Error(`${label} item ${index + 1} requires a title.`)
    if (result.owner && !MEMBERS.has(result.owner)) throw new Error(`${label} item ${index + 1} has an unrecognized owner.`)
    if (result.pillar && !DAILY_PLAN_PILLARS.includes(result.pillar)) throw new Error(`${label} item ${index + 1} has an invalid pillar.`)
    return result
  })
}

function dayparts(value) {
  if (!Array.isArray(value) || value.length > 8) throw new Error('Daily-plan dayparts must be a list with no more than 8 sections.')
  return value.map((part, index) => {
    assertObject(part, `Daily-plan daypart ${index + 1}`)
    rejectUnsupported(part, ['id', 'label', 'window', 'objective', 'items'], `Daily-plan daypart ${index + 1}`)
    return {
      id:clean(part.id, 100), label:clean(part.label, 200), window:clean(part.window, 200), objective:clean(part.objective, 1000),
      items:timelineItems(part.items ?? [], `Daily-plan daypart ${index + 1} items`),
    }
  })
}

function overviewPatch(value) {
  assertObject(value, 'The daily-plan overview patch')
  const allowed = ['theme', 'dayObjective', 'governingPrinciple', 'successStandard', 'topPriorities', 'decisions', 'dayparts']
  rejectUnsupported(value, allowed, 'The daily-plan overview patch')
  const result = {}
  for (const [field, raw] of Object.entries(value)) {
    if (['theme', 'dayObjective', 'governingPrinciple', 'successStandard'].includes(field)) {
      if (typeof raw !== 'string') throw new Error(`The daily-plan ${field} value must be text.`)
      result[field] = clean(raw, 3000)
    } else if (field === 'topPriorities' || field === 'decisions') result[field] = planItems(raw, `Daily-plan ${field}`)
    else if (field === 'dayparts') result.dayparts = dayparts(raw)
  }
  if (!Object.keys(result).length) throw new Error('The daily-plan overview patch does not contain a reviewed change.')
  return result
}

function simplePatch(value, allowed, label, listFields = []) {
  assertObject(value, label)
  rejectUnsupported(value, allowed, label)
  const result = {}
  for (const [field, raw] of Object.entries(value)) {
    if (listFields.includes(field)) result[field] = strings(raw, `${label} ${field}`)
    else {
      if (typeof raw !== 'string') throw new Error(`${label} ${field} must be text.`)
      result[field] = clean(raw, 6000)
    }
  }
  if (!Object.keys(result).length) throw new Error(`${label} does not contain a reviewed change.`)
  return result
}

export function normalizeDailyPlanActionPayload(type, input) {
  assertObject(input, `The ${type} action details`)
  if (type === 'plan.overview.update') {
    rejectUnsupported(input, ['patch', 'origin'], 'The daily-plan overview action')
    const origin = input.origin === undefined ? '' : clean(input.origin, 80)
    if (origin && origin !== 'generated-draft') throw new Error('The daily-plan overview action has an invalid origin.')
    return { patch:overviewPatch(input.patch), ...(origin ? { origin } : {}) }
  }
  if (type === 'plan.pillar.update') {
    rejectUnsupported(input, ['pillar', 'patch', 'origin'], 'The daily-plan pillar action')
    const pillar = clean(input.pillar, 40)
    const origin = input.origin === undefined ? '' : clean(input.origin, 80)
    if (origin && origin !== 'generated-draft') throw new Error('The daily-plan pillar action has an invalid origin.')
    return { pillar, patch:pillarPatch(pillar, input.patch), ...(origin ? { origin } : {}) }
  }
  if (type === 'plan.alignment.update') {
    rejectUnsupported(input, ['patch'], 'The Morning Alignment action')
    return { patch:simplePatch(input.patch, ['startTime', 'notes', 'completedAt'], 'The Morning Alignment patch') }
  }
  if (type === 'plan.recap.update') {
    rejectUnsupported(input, ['patch'], 'The daily recap action')
    return { patch:simplePatch(input.patch, ['wins', 'carryovers', 'lessons', 'tomorrowPrep', 'completedAt'], 'The daily recap patch', ['wins', 'carryovers', 'lessons', 'tomorrowPrep']) }
  }
  throw new Error(`Unsupported daily-plan action: ${type}.`)
}

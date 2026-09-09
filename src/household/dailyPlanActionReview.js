import { prepareCalendarAction, prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import { PILLAR_IDS, normalizeDailyPlan } from './dailyPlan.js'

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const ITEM_FIELDS = ['id', 'title', 'notes', 'owner', 'participants', 'status', 'priority', 'date', 'startTime', 'endTime', 'dueAt', 'requiresDecision', 'calendarSync', 'notificationLevel']
const PLAN_ITEM_FIELDS = new Set(ITEM_FIELDS)
export const PILLAR_EDITABLE_FIELDS = {
  spiritual:['scripture', 'devotionFocus', 'prayerFocus', 'discussionPrompts', 'obedienceAction', 'requiredOutput'],
  health:['breakfast', 'lunch', 'dinner', 'snacks', 'hydration', 'groceries', 'nextDayPrep', 'discussionPrompt'],
  fitness:['location', 'workout', 'objective', 'departureTime', 'returnTime', 'participants', 'stepGoal', 'recovery', 'requiresDecision', 'discussionPrompt'],
  household:['keyFocus', 'appointments', 'priorities', 'errands', 'openItems', 'careerPriorities'],
  education:['thinkTankTopic', 'thinkTankDeliverable', 'discussionPrompts', 'isaiah'],
  finance:['bills', 'purchases', 'transfers', 'accountsToFund', 'incomePipeline', 'decisionRule', 'discussionPrompt', 'requiredOutput'],
  ministry:['meetings', 'contentFocus', 'fellowshipFollowUps', 'prayerNeeds', 'readinessChecklist', 'framework'],
}
const ITEM_ARRAY_FIELDS = new Set(['topPriorities', 'decisions', 'appointments', 'priorities', 'bills', 'purchases', 'transfers', 'accountsToFund', 'meetings', 'fellowshipFollowUps'])

const cleanPlanItem = item => Object.fromEntries(Object.entries(item || {})
  .filter(([field]) => PLAN_ITEM_FIELDS.has(field))
  .map(([field, value]) => [field, clone(value)]))

const safeValue = (field, value) => ITEM_ARRAY_FIELDS.has(field)
  ? (Array.isArray(value) ? value.map(cleanPlanItem) : [])
  : clone(value)

function changedPatch(before, after, fields) {
  const patch = {}
  for (const field of fields) {
    const previous = safeValue(field, before?.[field])
    const desired = safeValue(field, after?.[field])
    if (!same(previous, desired)) patch[field] = desired
  }
  return patch
}

const planVersion = plan => {
  const value = Number(plan?.version || 0)
  if (!Number.isInteger(value) || value < 0) throw new Error('Refresh this daily plan before reviewing changes.')
  return value
}

const operation = (type, date, targetId, description, payload) => ({ type, targetDate:date, targetId, description, payload })

export function buildAlignmentOperations(originalInput, draftInput, { completedAt = '' } = {}) {
  const original = normalizeDailyPlan(originalInput)
  const draft = normalizeDailyPlan(draftInput)
  if (original.date !== draft.date) throw new Error('The alignment date changed. Return to Today and reopen this alignment.')
  const operations = []
  for (const pillar of PILLAR_IDS) {
    const patch = changedPatch(original[pillar], draft[pillar], PILLAR_EDITABLE_FIELDS[pillar])
    if (Object.keys(patch).length) operations.push(operation('plan.pillar.update', draft.date, pillar, `Review ${pillar} alignment changes for ${draft.date}`, { pillar, patch }))
  }
  const alignmentPatch = changedPatch(original.morningAlignment, draft.morningAlignment, ['startTime', 'notes'])
  if (completedAt && original.morningAlignment?.completedAt !== completedAt) alignmentPatch.completedAt = completedAt
  if (Object.keys(alignmentPatch).length) operations.push(operation('plan.alignment.update', draft.date, 'morningAlignment', `Review Morning Alignment status for ${draft.date}`, { patch:alignmentPatch }))
  if (operations.length > 8) throw new Error('This alignment contains too many record groups for one safe review. Save the local draft, then review fewer pillar changes at a time.')
  return operations
}

export function buildCalendarIntentOperations(planInput) {
  const plan=normalizeDailyPlan(planInput)
  return [
    ['household',plan.household.appointments],
    ['ministry',plan.ministry.meetings],
  ].flatMap(([,items])=>(items||[]).filter(item=>item.calendarSync&&item.title&&(item.date||plan.date)).map(item=>calendarIntentOperation(item,plan.date)))
}

export function calendarIntentOperation(item, planDate) {
  return {
    type:'calendar.create',
    targetId:`daily-${planDate}-${item.id}`,
    targetDate:item.date||planDate,
    description:`Add “${String(item.title).trim()}” to the Family Calendar`,
    payload:{
      title:String(item.title).trim(), notes:String(item.notes||''), owner:item.owner||'Family', participants:item.participants||[],
      date:item.date||planDate, time:item.startTime||'', allDay:!item.startTime,
      priority:['high','critical'].includes(item.priority)?'high':'normal',
    },
    allowedScopes:['this-item'], defaultScope:'this-item',
  }
}

export async function stageCalendarIntentReview({ operation, date }) {
  if(!operation)return null
  const result=await prepareCalendarAction({summary:`Add selected ${date} commitment to the Family Calendar`,operation})
  if(!result?.proposal)return null
  requestActionReview(result.proposal)
  return result.proposal
}

export function buildRecapOperations(originalInput, recap, completedAt) {
  const original = normalizeDailyPlan(originalInput)
  const desired = { ...(recap || {}), completedAt }
  const patch = changedPatch(original.recap, desired, ['wins', 'carryovers', 'lessons', 'tomorrowPrep', 'completedAt'])
  return Object.keys(patch).length
    ? [operation('plan.recap.update', original.date, 'recap', `Review the Evening Recap for ${original.date}`, { patch })]
    : []
}

export function buildPlanDraftOperations(currentInput, draftInput, { origin = 'generated-draft', pillars = PILLAR_IDS, includeRecap = false } = {}) {
  const current = normalizeDailyPlan(currentInput)
  const draft = normalizeDailyPlan(draftInput)
  if (current.date !== draft.date) throw new Error('The generated draft does not match the open daily-plan date.')
  const operations = []
  const overview = changedPatch(current, draft, ['theme', 'dayObjective', 'governingPrinciple', 'successStandard', 'topPriorities', 'decisions', 'dayparts'])
  if (Object.keys(overview).length) operations.push(operation('plan.overview.update', draft.date, 'overview', `Review the generated overview and decision board for ${draft.date}`, { patch:overview, origin }))
  for (const pillar of pillars) {
    const patch = changedPatch(current[pillar], draft[pillar], PILLAR_EDITABLE_FIELDS[pillar])
    if (Object.keys(patch).length) operations.push(operation('plan.pillar.update', draft.date, pillar, `Review the generated ${pillar} draft for ${draft.date}`, { pillar, patch, origin }))
  }
  if (includeRecap) {
    const patch = changedPatch(current.recap, draft.recap, ['wins', 'carryovers', 'lessons', 'tomorrowPrep', 'completedAt'])
    if (Object.keys(patch).length) operations.push(operation('plan.recap.update', draft.date, 'recap', `Review tomorrow-preparation details for ${draft.date}`, { patch }))
  }
  if (!operations.length) throw new Error('The generated draft does not differ from the current daily plan.')
  if (operations.length > 8) throw new Error('The generated draft contains too many record groups for one safe review.')
  return operations
}

export function decisionUpdateOperation(plan, decisionId, patch) {
  const current = normalizeDailyPlan(plan).decisions.find(item => item?.id === decisionId)
  if (!current) throw new Error('That decision is no longer in the open daily plan. Refresh Today and try again.')
  const reviewed = changedPatch(current, patch, ['title', 'notes', 'owner', 'participants', 'status', 'date'].filter(field => Object.hasOwn(patch || {}, field)))
  if (!Object.keys(reviewed).length) throw new Error('Change at least one decision field before opening review.')
  return operation('decision.update', plan.date, decisionId, `Review changes to “${current.title || 'daily decision'}”`, reviewed)
}

export function assignmentUpdateOperation(plan, assignmentId, patch) {
  const current = normalizeDailyPlan(plan).assignments.find(item => item?.id === assignmentId)
  if (!current) throw new Error('That assignment is no longer in the open daily plan. Refresh Today and try again.')
  const reviewed = changedPatch(current, patch, ['title', 'notes', 'owner', 'participants', 'status', 'date', 'priority'].filter(field => Object.hasOwn(patch || {}, field)))
  if (!Object.keys(reviewed).length) throw new Error('Change at least one assignment field before opening review.')
  return operation('assignment.update', plan.date, assignmentId, `Review changes to “${current.title || 'daily assignment'}”`, reviewed)
}

export async function stageDailyPlanReview({ summary, operations, expectedVersion }) {
  if (!operations?.length) throw new Error('Change at least one daily-plan field before opening review.')
  const version = Number(expectedVersion)
  if (!Number.isInteger(version) || version < 0) throw new Error('Refresh this daily plan before opening Action Mode review.')
  const result = await prepareDirectAction({ summary, operations, expectedVersion:version })
  if (!result?.proposal) throw new Error('Action Mode did not return a reviewable daily-plan proposal.')
  requestActionReview(result.proposal)
  return result.proposal
}

export { planVersion }

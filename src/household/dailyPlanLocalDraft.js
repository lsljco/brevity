import { PILLAR_IDS, normalizeDailyPlan } from './dailyPlan.js'
import { PILLAR_EDITABLE_FIELDS } from './dailyPlanActionReview.js'

const SCHEMA = 1
const keyFor = date => `brevity_daily_alignment_draft_v${SCHEMA}:${date}`
const recapKeyFor = date => `brevity_daily_recap_draft_v${SCHEMA}:${date}`
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))

export function alignmentDraftSnapshot(planInput) {
  const plan = normalizeDailyPlan(planInput)
  return {
    date:plan.date,
    morningAlignment:clone(plan.morningAlignment),
    pillars:Object.fromEntries(PILLAR_IDS.map(pillar => [pillar, Object.fromEntries(PILLAR_EDITABLE_FIELDS[pillar]
      .filter(field => field in plan[pillar])
      .map(field => [field, clone(plan[pillar][field])]))])),
  }
}

export function saveLocalAlignmentDraft(storage, planInput, baseVersion) {
  const plan = normalizeDailyPlan(planInput)
  storage?.setItem?.(keyFor(plan.date), JSON.stringify({ schema:SCHEMA, baseVersion:Number(baseVersion || 0), savedAt:new Date().toISOString(), draft:alignmentDraftSnapshot(plan) }))
}

export function loadLocalAlignmentDraft(storage, planInput, baseVersion) {
  const plan = normalizeDailyPlan(planInput)
  let saved
  try { saved = JSON.parse(storage?.getItem?.(keyFor(plan.date)) || 'null') } catch { return plan }
  if (saved?.schema !== SCHEMA || saved?.draft?.date !== plan.date || Number(saved.baseVersion) !== Number(baseVersion || 0)) return plan
  const next = { ...plan, morningAlignment:{ ...plan.morningAlignment, ...(saved.draft.morningAlignment || {}) } }
  for (const pillar of PILLAR_IDS) {
    const patch = saved.draft.pillars?.[pillar]
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) continue
    next[pillar] = pillar === 'education' && patch.isaiah
      ? { ...next[pillar], ...patch, isaiah:{ ...next[pillar].isaiah, ...patch.isaiah } }
      : { ...next[pillar], ...patch }
  }
  return normalizeDailyPlan(next)
}

export function clearLocalAlignmentDraft(storage, date) {
  storage?.removeItem?.(keyFor(date))
}

export function saveLocalRecapDraft(storage, planInput, recapInput, baseVersion) {
  const plan = normalizeDailyPlan(planInput)
  storage?.setItem?.(recapKeyFor(plan.date), JSON.stringify({
    schema:SCHEMA,
    baseVersion:Number(baseVersion || 0),
    savedAt:new Date().toISOString(),
    recap:clone(recapInput),
  }))
}

export function loadLocalRecapDraft(storage, planInput, baseVersion) {
  const plan = normalizeDailyPlan(planInput)
  let saved
  try { saved = JSON.parse(storage?.getItem?.(recapKeyFor(plan.date)) || 'null') } catch { return plan.recap }
  if (saved?.schema !== SCHEMA || Number(saved.baseVersion) !== Number(baseVersion || 0) || !saved.recap || typeof saved.recap !== 'object' || Array.isArray(saved.recap)) return plan.recap
  return {
    ...plan.recap,
    wins:Array.isArray(saved.recap.wins) ? clone(saved.recap.wins) : plan.recap.wins,
    carryovers:Array.isArray(saved.recap.carryovers) ? clone(saved.recap.carryovers) : plan.recap.carryovers,
    lessons:Array.isArray(saved.recap.lessons) ? clone(saved.recap.lessons) : plan.recap.lessons,
    tomorrowPrep:Array.isArray(saved.recap.tomorrowPrep) ? clone(saved.recap.tomorrowPrep) : plan.recap.tomorrowPrep,
  }
}

export function clearLocalRecapDraft(storage, date) {
  storage?.removeItem?.(recapKeyFor(date))
}

export { keyFor as localAlignmentDraftKey }
export { recapKeyFor as localRecapDraftKey }

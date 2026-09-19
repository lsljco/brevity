// Preserve the established daily-plan contract and add one explicit, bounded
// practice record. All writes still use Action Mode's permissions, exact plan
// version, audit log and Undo; generated plans cannot claim real-world actions.
import { normalizeDailyPlanActionPayload as normalizeCore } from './daily-plan-core-fields.mjs'
import { validatePracticeDay } from '../../src/household/operatingPractices.js'
export { DAILY_PLAN_PILLARS } from './daily-plan-core-fields.mjs'

export function normalizeDailyPlanActionPayload(type, input) {
  const patch = input?.patch
  if (type !== 'plan.pillar.update' || input?.pillar !== 'household' || !patch || !Object.hasOwn(patch, 'practiceDay')) return normalizeCore(type, input)
  if (!input || typeof input !== 'object' || Array.isArray(input) || Array.isArray(patch) || typeof patch !== 'object') throw new Error('The practice change requires an object patch.')
  if (Object.keys(input).some(key => !['pillar', 'patch'].includes(key))) throw new Error('Practice records require explicit human review and cannot be generated as completed work.')
  const { practiceDay, ...otherFields } = patch
  const other = Object.keys(otherFields).length ? normalizeCore(type, { pillar: 'household', patch: otherFields }).patch : {}
  return { pillar: 'household', patch: { ...other, practiceDay: validatePracticeDay(practiceDay) } }
}

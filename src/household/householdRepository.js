import { createDailyPlan, localDateKey } from './dailyPlan.js'

const STORAGE_KEY = 'brevity_daily_plans_v1'

function readLocalPlans() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch (error) {
    console.error('[householdRepository] Could not read local plans:', error)
    return {}
  }
}

function writeLocalPlans(plans) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
}

export async function getDailyPlan(date = new Date()) {
  const dateKey = typeof date === 'string' ? date : localDateKey(date)
  const plans = readLocalPlans()
  return plans[dateKey] || createDailyPlan(dateKey)
}

export async function saveDailyPlan(plan) {
  if (!plan?.date) throw new Error('A daily plan requires a date.')

  const plans = readLocalPlans()
  const nextPlan = {
    ...plan,
    id: plan.id || plan.date,
    updatedAt: new Date().toISOString(),
  }

  plans[plan.date] = nextPlan
  writeLocalPlans(plans)
  return nextPlan
}

export async function listDailyPlans() {
  return Object.values(readLocalPlans()).sort((a, b) => b.date.localeCompare(a.date))
}

export async function deleteDailyPlan(date) {
  const plans = readLocalPlans()
  delete plans[date]
  writeLocalPlans(plans)
}

// Intentionally isolated behind this module. The next persistence step will
// replace these local methods with an authenticated shared household API while
// keeping consumers (Today, Alignment, My Day, AI generation) unchanged.
export const householdRepository = {
  getDailyPlan,
  saveDailyPlan,
  listDailyPlans,
  deleteDailyPlan,
}

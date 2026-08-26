import { randomUUID } from 'node:crypto'
import {
  createRollingMealDay,
  DEFAULT_MEAL_TIME_ZONE,
  mealDateInTimeZone,
  mealLibrarySummary,
  resolveMealDay,
  rollingMealDates,
  validateMealSubstitution,
} from '../../src/meals/mealPlanData.js'
import { MEAL_LIBRARY } from '../../src/meals/mealLibrary.js'

const STORE_NAME = 'brevity-meals'

const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-')

export function createMealPlanRepository({ store, householdId = 'lslj-family', timeZone = DEFAULT_MEAL_TIME_ZONE, now = () => new Date(), createId = randomUUID }) {
  const household = safeSegment(householdId)
  const dayKey = date => `${household}/days/${date}`
  const auditKey = (date, id) => `${household}/audit/${date}/${id}`

  const getDay = async date => store.get(dayKey(date), { type: 'json' })

  const createDay = date => createRollingMealDay(date, {
    householdId,
    now: now().toISOString(),
  })

  const ensureDay = async date => {
    const current = await getDay(date)
    if (current) return current
    const generated = createDay(date)
    await store.setJSON(dayKey(date), generated)
    return generated
  }

  const getWindow = async ({ startDate = mealDateInTimeZone(now(), timeZone), count = 7 } = {}) => {
    const dates = rollingMealDates(startDate, count)
    const days = await Promise.all(dates.map(ensureDay))
    return {
      householdId,
      timeZone,
      startDate,
      days: days.map(resolveMealDay),
      library: MEAL_LIBRARY,
      librarySummary: mealLibrarySummary(),
    }
  }

  const getWindowReadOnly = async ({ startDate = mealDateInTimeZone(now(), timeZone), count = 7 } = {}) => {
    const dates = rollingMealDates(startDate, count)
    const days = await Promise.all(dates.map(async date => (await getDay(date)) || createDay(date)))
    return {
      householdId,
      timeZone,
      startDate,
      days: days.map(resolveMealDay),
      librarySummary: mealLibrarySummary(),
    }
  }

  const substitute = async ({ date, mealType, mealId, expectedVersion, actor = 'Household member' }) => {
    const errors = validateMealSubstitution({ date, mealType, mealId })
    if (errors.length) {
      const error = new Error(errors.join(' '))
      error.code = 'VALIDATION_ERROR'
      throw error
    }

    const current = await ensureDay(date)
    if (Number(expectedVersion) !== Number(current.version)) {
      const error = new Error('This meal plan changed on another device. Refresh and try again.')
      error.code = 'VERSION_CONFLICT'
      throw error
    }

    const changedAt = now().toISOString()
    const auditId = createId()
    const previousMealId = current.meals[mealType]
    const audit = {
      id: auditId,
      householdId,
      action: 'meal.substituted',
      date,
      mealType,
      previousMealId,
      mealId,
      actor,
      occurredAt: changedAt,
      fromVersion: current.version,
      toVersion: current.version + 1,
    }
    await store.setJSON(auditKey(date, auditId), audit)

    const next = {
      ...current,
      version: current.version + 1,
      meals: { ...current.meals, [mealType]: mealId },
      substitutions: {
        ...current.substitutions,
        [mealType]: { previousMealId, mealId, changedAt, changedBy: actor, auditId },
      },
      updatedAt: changedAt,
      updatedBy: actor,
    }
    await store.setJSON(dayKey(date), next)
    return resolveMealDay(next)
  }

  return { ensureDay, getWindow, getWindowReadOnly, substitute }
}

export async function productionMealPlanRepository(options = {}) {
  const { getStore } = await import('@netlify/blobs')
  const store = getStore({
    name: STORE_NAME,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
  return createMealPlanRepository({
    store,
    householdId: process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family',
    timeZone: process.env.BREVITY_TIME_ZONE || DEFAULT_MEAL_TIME_ZONE,
    ...options,
  })
}

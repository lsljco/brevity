import { MEAL_LIBRARY, MEAL_TYPES, mealsForType } from './mealLibrary.js'

export const MEAL_PLAN_SCHEMA_VERSION = 1
export const DEFAULT_MEAL_TIME_ZONE = 'America/New_York'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const customMealType = mealId => {
  const match = /^custom-(breakfast|lunch|dinner)-[a-zA-Z0-9-]+$/.exec(String(mealId || ''))
  return match?.[1] || ''
}
const libraryIndex = library => new Map((Array.isArray(library) ? library : MEAL_LIBRARY).map(meal => [meal.id, meal]))

export function validMealDate(value) {
  const text = String(value || '')
  if (!DATE_PATTERN.test(text)) return false
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
}

export function mealDateInTimeZone(now = new Date(), timeZone = DEFAULT_MEAL_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function addMealDays(date, amount) {
  if (!validMealDate(date)) throw new Error('A valid YYYY-MM-DD meal-plan date is required.')
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + Number(amount || 0))
  return value.toISOString().slice(0, 10)
}

export function rollingMealDates(startDate, count = 7) {
  if (!validMealDate(startDate)) throw new Error('A valid YYYY-MM-DD meal-plan start date is required.')
  const length = Math.max(1, Math.min(31, Number(count) || 7))
  return Array.from({ length }, (_, index) => addMealDays(startDate, index))
}

function dayNumber(date) {
  return Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 86400000)
}

export function rotatingMealForDate(date, mealType) {
  if (!MEAL_TYPES.includes(mealType)) throw new Error('Unknown meal type.')
  const candidates = mealsForType(mealType)
  const offsets = { breakfast: 0, lunch: 11, dinner: 23 }
  const index = ((dayNumber(date) * 7 + offsets[mealType]) % candidates.length + candidates.length) % candidates.length
  return candidates[index]
}

export function createRollingMealDay(date, context = {}) {
  if (!validMealDate(date)) throw new Error('A valid YYYY-MM-DD meal-plan date is required.')
  const now = String(context.now || new Date().toISOString())
  return {
    id: `meal-plan-${date}`,
    householdId: String(context.householdId || 'lslj-family'),
    schemaVersion: MEAL_PLAN_SCHEMA_VERSION,
    version: 1,
    date,
    meals: Object.fromEntries(MEAL_TYPES.map(mealType => [mealType, rotatingMealForDate(date, mealType).id])),
    substitutions: {},
    generatedBy: 'brevity-rolling-meal-plan',
    createdAt: now,
    createdBy: 'Brevity',
    updatedAt: now,
    updatedBy: 'Brevity',
  }
}

export function resolveMealDay(day, library = MEAL_LIBRARY) {
  const byId = libraryIndex(library)
  return {
    ...day,
    resolvedMeals: Object.fromEntries(MEAL_TYPES.map(mealType => [mealType, byId.get(day?.meals?.[mealType]) || null])),
  }
}

export function validateMealSubstitution({ date, mealType, mealId }, library) {
  const errors = []
  if (!validMealDate(date)) errors.push('A valid meal-plan date is required.')
  if (!MEAL_TYPES.includes(mealType)) errors.push('Choose breakfast, lunch or dinner.')

  const suppliedLibrary = Array.isArray(library)
  const meal = libraryIndex(library).get(mealId)
  if (!meal) {
    // Action Mode validates built-in meals without loading the meal store. Custom
    // IDs carry their meal type so a reviewed custom selection can still pass
    // that synchronous guard; plan reads resolve the ID against the household
    // library before displaying it.
    if (suppliedLibrary || customMealType(mealId) !== mealType) errors.push('Choose a meal from the household meal library.')
  } else if (meal.mealType !== mealType) {
    errors.push(`The selected meal is not a ${mealType} option.`)
  }
  return errors
}

export function mealLibrarySummary(library = MEAL_LIBRARY) {
  const source = Array.isArray(library) ? library : MEAL_LIBRARY
  return {
    total: source.length,
    counts: Object.fromEntries(MEAL_TYPES.map(mealType => [mealType, source.filter(meal => meal.mealType === mealType).length])),
  }
}

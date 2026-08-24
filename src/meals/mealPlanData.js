import { MEAL_LIBRARY, MEALS_BY_ID, MEAL_TYPES, mealsForType } from './mealLibrary.js'

export const MEAL_PLAN_SCHEMA_VERSION = 1
export const DEFAULT_MEAL_TIME_ZONE = 'America/New_York'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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

export function resolveMealDay(day) {
  return {
    ...day,
    resolvedMeals: Object.fromEntries(MEAL_TYPES.map(mealType => [mealType, MEALS_BY_ID.get(day?.meals?.[mealType]) || null])),
  }
}

export function validateMealSubstitution({ date, mealType, mealId }) {
  const errors = []
  if (!validMealDate(date)) errors.push('A valid meal-plan date is required.')
  if (!MEAL_TYPES.includes(mealType)) errors.push('Choose breakfast, lunch or dinner.')
  const meal = MEALS_BY_ID.get(mealId)
  if (!meal) errors.push('Choose a meal from the household meal library.')
  else if (meal.mealType !== mealType) errors.push(`The selected meal is not a ${mealType} option.`)
  return errors
}

export function mealLibrarySummary() {
  return {
    total: MEAL_LIBRARY.length,
    counts: Object.fromEntries(MEAL_TYPES.map(mealType => [mealType, mealsForType(mealType).length])),
  }
}

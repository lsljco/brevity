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
import { MEAL_LIBRARY, MEAL_TYPES } from '../../src/meals/mealLibrary.js'

const STORE_NAME = 'brevity-meals'

const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-')
const numeric = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeMealInput(meal, actor, now, createId) {
  const mealType = String(meal?.mealType || '').toLowerCase()
  const name = String(meal?.name || '').trim()
  const prepMinutes = numeric(meal?.prepMinutes)
  const cookMinutes = numeric(meal?.cookMinutes ?? 0)
  const suppliedTotalMinutes = meal?.totalMinutes === undefined || meal?.totalMinutes === '' ? null : numeric(meal.totalMinutes)
  const calories = numeric(meal?.macros?.calories)
  const proteinGrams = numeric(meal?.macros?.proteinGrams)
  const carbohydrateGrams = numeric(meal?.macros?.carbohydrateGrams)
  const fatGrams = numeric(meal?.macros?.fatGrams)
  const errors = []

  if (!MEAL_TYPES.includes(mealType)) errors.push('Choose breakfast, lunch or dinner.')
  if (!name) errors.push('Meal name is required.')
  if (prepMinutes == null || cookMinutes == null || (meal?.totalMinutes !== undefined && meal?.totalMinutes !== '' && suppliedTotalMinutes == null)) errors.push('Prep, cook and total time must each be zero or greater.')
  if ([calories, proteinGrams, carbohydrateGrams, fatGrams].some(value => value == null)) errors.push('Calories, protein, carbs and fat must each be zero or greater.')
  if (errors.length) {
    const error = new Error(errors.join(' '))
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  const createdAt = now().toISOString()
  return {
    id: `custom-${mealType}-${safeSegment(createId())}`,
    custom: true,
    mealType,
    name,
    description: String(meal?.description || '').trim() || name,
    prepMinutes: Math.round(prepMinutes),
    cookMinutes: Math.round(cookMinutes),
    totalMinutes: Math.round(suppliedTotalMinutes == null ? prepMinutes + cookMinutes : suppliedTotalMinutes),
    ingredients: (Array.isArray(meal?.ingredients) ? meal.ingredients : String(meal?.ingredients || '').split(/\r?\n/)).map(value => String(value || '').trim()).filter(Boolean),
    image: String(meal?.image || '').trim(),
    serving: String(meal?.serving || '').trim() || '1 serving',
    nutritionBasis: 'Household-entered nutrition estimate',
    macros: {
      calories: Math.round(calories),
      proteinGrams: Math.round(proteinGrams),
      carbohydrateGrams: Math.round(carbohydrateGrams),
      fatGrams: Math.round(fatGrams),
    },
    tags: ['household custom'],
    createdAt,
    createdBy: actor,
    updatedAt: createdAt,
    updatedBy: actor,
  }
}

export function createMealPlanRepository({ store, householdId = 'lslj-family', timeZone = DEFAULT_MEAL_TIME_ZONE, now = () => new Date(), createId = randomUUID }) {
  const household = safeSegment(householdId)
  const dayKey = date => `${household}/days/${date}`
  const customLibraryKey = `${household}/library/custom`
  const getDayEntry=async date=>{
    if(typeof store.getWithMetadata==='function'){
      const entry=await store.getWithMetadata(dayKey(date),{type:'json'})
      return entry?{day:entry.data,etag:entry.etag||''}:{day:null,etag:''}
    }
    return{day:await store.get(dayKey(date),{type:'json'}),etag:''}
  }
  const getDay = async date => (await getDayEntry(date)).day

  const getCustomLibraryEntry = async () => {
    if (typeof store.getWithMetadata === 'function') {
      const entry = await store.getWithMetadata(customLibraryKey, { type:'json' })
      return entry ? { data:entry.data, etag:entry.etag || '', metadata:true } : { data:null, etag:'', metadata:true }
    }
    return { data:await store.get(customLibraryKey, { type:'json' }), etag:'', metadata:false }
  }

  const getLibrary = async () => {
    const entry = await getCustomLibraryEntry()
    const customMeals = Array.isArray(entry.data?.meals) ? entry.data.meals : []
    return { entry, customMeals, library:[...MEAL_LIBRARY, ...customMeals] }
  }

  const createDay = date => createRollingMealDay(date, {
    householdId,
    now: now().toISOString(),
  })

  const ensureDay = async date => {
    const current = await getDay(date)
    if (current) return current
    const generated = createDay(date)
    const created=await store.setJSON(dayKey(date),generated,{onlyIfNew:true})
    if(created?.modified===false){
      const winner=await getDay(date)
      if(!winner)throw new Error('The meal plan was created concurrently but could not be reloaded.')
      return winner
    }
    return generated
  }

  const buildWindow = async ({ startDate, count, readOnly }) => {
    const dates = rollingMealDates(startDate, count)
    const [libraryState, days] = await Promise.all([
      getLibrary(),
      Promise.all(dates.map(async date => readOnly ? (await getDay(date)) || createDay(date) : ensureDay(date))),
    ])
    return {
      householdId,
      timeZone,
      startDate,
      days: days.map(day => resolveMealDay(day, libraryState.library)),
      library: libraryState.library,
      librarySummary: mealLibrarySummary(libraryState.library),
    }
  }

  const getWindow = async ({ startDate = mealDateInTimeZone(now(), timeZone), count = 7 } = {}) => buildWindow({ startDate, count, readOnly:false })

  const getWindowReadOnly = async ({ startDate = mealDateInTimeZone(now(), timeZone), count = 7 } = {}) => buildWindow({ startDate, count, readOnly:true })

  const createMeal = async ({ meal, actor = 'Household member' }) => {
    const createdMeal = normalizeMealInput(meal, actor, now, createId)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { entry, customMeals } = await getLibrary()
      const duplicate = [...MEAL_LIBRARY, ...customMeals].some(existing => existing.mealType === createdMeal.mealType && existing.name.trim().toLowerCase() === createdMeal.name.toLowerCase())
      if (duplicate) {
        const error = new Error(`${createdMeal.name} is already in the ${createdMeal.mealType} library.`)
        error.code = 'VALIDATION_ERROR'
        throw error
      }
      const payload = {
        version: Number(entry.data?.version || 0) + 1,
        meals: [...customMeals, createdMeal],
        updatedAt: now().toISOString(),
        updatedBy: actor,
      }
      const options = entry.metadata ? (entry.data ? { onlyIfMatch:entry.etag } : { onlyIfNew:true }) : {}
      const written = await store.setJSON(customLibraryKey, payload, options)
      if (written?.modified !== false) return createdMeal
    }
    const error = new Error('The meal library changed on another device. Please try adding the meal again.')
    error.code = 'VERSION_CONFLICT'
    throw error
  }

  const substitute = async ({ date, mealType, mealId, expectedVersion, actor = 'Household member' }) => {
    const { library } = await getLibrary()
    const errors = validateMealSubstitution({ date, mealType, mealId }, library)
    if (errors.length) {
      const error = new Error(errors.join(' '))
      error.code = 'VALIDATION_ERROR'
      throw error
    }

    void date;void mealType;void mealId;void expectedVersion;void actor
    const error=new Error('Meal substitutions require Action Mode review and confirmation.')
    error.code='REVIEW_REQUIRED'
    throw error
  }

  return { ensureDay, getDay, getDayEntry, getLibrary, getWindow, getWindowReadOnly, createMeal, substitute }
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

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
import { fallbackMealImage, MEAL_LIBRARY, MEAL_TYPES } from '../../src/meals/mealLibrary.js'

const STORE_NAME = 'brevity-meals'

const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-')
const numeric = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
const safeText = (value, maximum = 500) => String(value || '').trim().slice(0, maximum)
const normalizeIngredientNutrition = rows => (Array.isArray(rows) ? rows : []).slice(0, 30).map(row => ({
  input: safeText(row?.input, 240),
  resolvedName: safeText(row?.resolvedName, 240),
  amountDescription: safeText(row?.amountDescription, 240),
  basis: safeText(row?.basis, 500),
  confidence: ['high', 'medium', 'low'].includes(row?.confidence) ? row.confidence : 'low',
  macros: {
    calories: Math.round(numeric(row?.macros?.calories) || 0),
    proteinGrams: Math.round(numeric(row?.macros?.proteinGrams) || 0),
    carbohydrateGrams: Math.round(numeric(row?.macros?.carbohydrateGrams) || 0),
    fatGrams: Math.round(numeric(row?.macros?.fatGrams) || 0),
  },
}))

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
    timingRecorded: meal?.timingRecorded !== false,
    ingredients: (Array.isArray(meal?.ingredients) ? meal.ingredients : String(meal?.ingredients || '').split(/\r?\n/)).map(value => String(value || '').trim()).filter(Boolean),
    instructions: (Array.isArray(meal?.instructions) ? meal.instructions : String(meal?.instructions || '').split(/\r?\n/)).map(value => String(value || '').trim()).filter(Boolean).slice(0, 30),
    image: String(meal?.image || '').trim(),
    serving: String(meal?.serving || '').trim() || '1 serving',
    yieldQuantity: numeric(meal?.yieldQuantity),
    yieldUnit: String(meal?.yieldUnit || '').trim(),
    batchMacros: meal?.batchMacros ? {
      calories:Math.round(numeric(meal.batchMacros.calories) || 0),
      proteinGrams:Math.round(numeric(meal.batchMacros.proteinGrams) || 0),
      carbohydrateGrams:Math.round(numeric(meal.batchMacros.carbohydrateGrams) || 0),
      fatGrams:Math.round(numeric(meal.batchMacros.fatGrams) || 0),
    } : undefined,
    ingredientNutrition: normalizeIngredientNutrition(meal?.ingredientNutrition),
    nutritionWarnings: Array.isArray(meal?.nutritionWarnings) ? meal.nutritionWarnings.map(value=>String(value||'').trim()).filter(Boolean).slice(0,20) : [],
    nutritionBasis: String(meal?.nutritionBasis || '').trim() || 'Household-entered nutrition estimate',
    sourceUrl: safeText(meal?.sourceUrl, 2048),
    sourceName: safeText(meal?.sourceName, 160),
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
  const imageOverridesKey = `${household}/library/image-overrides`
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
    const [entry, imageEntry] = await Promise.all([getCustomLibraryEntry(), typeof store.getWithMetadata === 'function'
      ? store.getWithMetadata(imageOverridesKey, { type:'json' }).then(result => result ? { data:result.data, etag:result.etag || '', metadata:true } : { data:null, etag:'', metadata:true })
      : store.get(imageOverridesKey, { type:'json' }).then(data => ({ data, etag:'', metadata:false }))])
    const customMeals = Array.isArray(entry.data?.meals) ? entry.data.meals : []
    const imageOverrides = imageEntry.data?.images && typeof imageEntry.data.images === 'object' ? imageEntry.data.images : {}
    const library = [...MEAL_LIBRARY, ...customMeals].map(meal => imageOverrides[meal.id] ? { ...meal, image:imageOverrides[meal.id], imageGenerated:true } : meal)
    return { entry, imageEntry, customMeals, library }
  }

  const setMealImage = async ({ mealId, image, actor = 'Household member' }) => {
    const safeMealId = safeText(mealId, 180)
    const safeImage = safeText(image, 500)
    if (!safeMealId || !safeImage) throw Object.assign(new Error('A valid meal and generated image are required.'), { code:'VALIDATION_ERROR' })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { imageEntry, library } = await getLibrary()
      if (!library.some(meal => meal.id === safeMealId)) throw Object.assign(new Error('That meal is no longer in the household library.'), { code:'VALIDATION_ERROR' })
      const currentImages = imageEntry.data?.images && typeof imageEntry.data.images === 'object' ? imageEntry.data.images : {}
      const payload = { version:Number(imageEntry.data?.version || 0) + 1, images:{ ...currentImages, [safeMealId]:safeImage }, updatedAt:now().toISOString(), updatedBy:actor }
      const options = imageEntry.metadata ? (imageEntry.data ? { onlyIfMatch:imageEntry.etag } : { onlyIfNew:true }) : {}
      const written = await store.setJSON(imageOverridesKey, payload, options)
      if (written?.modified !== false) return { mealId:safeMealId, image:safeImage }
    }
    throw Object.assign(new Error('The meal image changed on another device. Please try again.'), { code:'VERSION_CONFLICT' })
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
    const viewLibrary = libraryState.library.map(meal => {
      if (meal.image) return meal
      const image = fallbackMealImage(meal, libraryState.library)
      return image ? { ...meal, image, imageFallback:true } : meal
    })
    return {
      householdId,
      timeZone,
      startDate,
      days: days.map(day => resolveMealDay(day, viewLibrary)),
      library: viewLibrary,
      librarySummary: mealLibrarySummary(viewLibrary),
    }
  }

  const getWindow = async ({ startDate = mealDateInTimeZone(now(), timeZone), count = 7 } = {}) => buildWindow({ startDate, count, readOnly:false })

  const getWindowReadOnly = async ({ startDate = mealDateInTimeZone(now(), timeZone), count = 7 } = {}) => buildWindow({ startDate, count, readOnly:true })

  const createMeal = async ({ meal, actor = 'Household member', generateImage }) => {
    let createdMeal = normalizeMealInput(meal, actor, now, createId)
    let imageGenerated = Boolean(createdMeal.image)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { entry, customMeals } = await getLibrary()
      const duplicate = [...MEAL_LIBRARY, ...customMeals].some(existing => existing.mealType === createdMeal.mealType && existing.name.trim().toLowerCase() === createdMeal.name.toLowerCase())
      if (duplicate) {
        const error = new Error(`${createdMeal.name} is already in the ${createdMeal.mealType} library.`)
        error.code = 'VALIDATION_ERROR'
        throw error
      }
      if (!imageGenerated && generateImage) {
        createdMeal = { ...createdMeal, image:await generateImage(createdMeal, createdMeal.id) }
        imageGenerated = true
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

  const createMeals = async ({ meals, actor = 'Household member' }) => {
    if (!Array.isArray(meals) || !meals.length || meals.length > 50) {
      const error = new Error('Choose 1 to 50 meals for a bulk import.')
      error.code = 'VALIDATION_ERROR'
      throw error
    }
    const createdMeals = meals.map(meal => normalizeMealInput({ ...meal, image:'' }, actor, now, createId))
    const keys = createdMeals.map(meal => `${meal.mealType}:${meal.name.trim().toLowerCase()}`)
    if (new Set(keys).size !== keys.length) {
      const error = new Error('The batch contains duplicate meal names in the same meal type. Review the duplicates before saving.')
      error.code = 'VALIDATION_ERROR'
      throw error
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { entry, customMeals } = await getLibrary()
      const existing = new Set([...MEAL_LIBRARY, ...customMeals].map(meal => `${meal.mealType}:${meal.name.trim().toLowerCase()}`))
      const duplicate = createdMeals.find((meal, index) => existing.has(keys[index]))
      if (duplicate) {
        const error = new Error(`${duplicate.name} is already in the ${duplicate.mealType} library.`)
        error.code = 'VALIDATION_ERROR'
        throw error
      }
      const payload = { version:Number(entry.data?.version || 0) + 1, meals:[...customMeals, ...createdMeals], updatedAt:now().toISOString(), updatedBy:actor }
      const options = entry.metadata ? (entry.data ? { onlyIfMatch:entry.etag } : { onlyIfNew:true }) : {}
      const written = await store.setJSON(customLibraryKey, payload, options)
      if (written?.modified !== false) return createdMeals
    }
    const error = new Error('The meal library changed on another device. Refresh and review the batch before trying again.')
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

  return { ensureDay, getDay, getDayEntry, getLibrary, getWindow, getWindowReadOnly, createMeal, createMeals, setMealImage, substitute }
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

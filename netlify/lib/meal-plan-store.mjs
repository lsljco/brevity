import {effectiveMealDay,refreshAutomaticDay} from '../../src/meals/householdMealPlanning.js'
import { normalizeMealInput, safeSegment, safeText } from './meal-input.mjs'
import {resolvedRecipes} from './recipe-library-actions.mjs'
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
    const library = resolvedRecipes(entry.data||{}).map(meal => imageOverrides[meal.id] ? { ...meal, image:imageOverrides[meal.id], imageGenerated:true } : meal)
    return { entry, imageEntry, customMeals, library }
  }

  const setMealImage = async ({ mealId, image, actor = 'Household member', onlyIfMissing = false }) => {
    const safeMealId = safeText(mealId, 180)
    const safeImage = safeText(image, 500)
    if (!safeMealId || !safeImage) throw Object.assign(new Error('A valid meal and generated image are required.'), { code:'VALIDATION_ERROR' })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { imageEntry, library } = await getLibrary()
      if (!library.some(meal => meal.id === safeMealId)) throw Object.assign(new Error('That meal is no longer in the household library.'), { code:'VALIDATION_ERROR' })
      const existing=library.find(meal=>meal.id===safeMealId)
      if(onlyIfMissing&&existing?.image)return {mealId:safeMealId,image:existing.image}
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
    const [libraryState, days, schedule] = await Promise.all([
      getLibrary(),
      Promise.all(dates.map(async date => readOnly ? (await getDay(date)) || createDay(date) : ensureDay(date))),
      store.get(`${household}/schedule`,{type:'json'}),
    ])
    const viewLibrary = libraryState.library.map(meal => {
      if (meal.image || meal.tags?.includes('snack')) return meal
      const image = fallbackMealImage(meal, libraryState.library)
      return image ? { ...meal, image, imageFallback:true } : meal
    })
    return {
      householdId,
      timeZone,
      startDate,
      days: days.map(day => resolveMealDay(effectiveMealDay(refreshAutomaticDay(day,libraryState.library),schedule), viewLibrary)),
      scheduleVersion:Number(schedule?.version||0),
      library: viewLibrary,
      libraryVersion:Number(libraryState.entry.data?.version||0),
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
        ...entry.data,
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
      const payload = { ...entry.data, version:Number(entry.data?.version || 0) + 1, meals:[...customMeals, ...createdMeals], updatedAt:now().toISOString(), updatedBy:actor }
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
  const { getStore } = await import('./scoped-store.mjs')
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

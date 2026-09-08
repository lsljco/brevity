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

export function createMealPlanRepository({ store, householdId = 'lslj-family', timeZone = DEFAULT_MEAL_TIME_ZONE, now = () => new Date() }) {
  const household = safeSegment(householdId)
  const dayKey = date => `${household}/days/${date}`
  const getDayEntry=async date=>{
    if(typeof store.getWithMetadata==='function'){
      const entry=await store.getWithMetadata(dayKey(date),{type:'json'})
      return entry?{day:entry.data,etag:entry.etag||''}:{day:null,etag:''}
    }
    return{day:await store.get(dayKey(date),{type:'json'}),etag:''}
  }
  const getDay = async date => (await getDayEntry(date)).day

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

    void date;void mealType;void mealId;void expectedVersion;void actor
    const error=new Error('Meal substitutions require Action Mode review and confirmation.')
    error.code='REVIEW_REQUIRED'
    throw error
  }

  return { ensureDay, getDay, getDayEntry, getWindow, getWindowReadOnly, substitute }
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

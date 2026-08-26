import { getStore } from '@netlify/blobs'
import { productionMealPlanRepository } from './meal-plan-store.mjs'

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const HOUSEHOLD_STORE = 'brevity-household'
const ACTIVE_SERMON_KEY = `${HOUSEHOLD_ID}/spiritual/active-sermon`
const SENSITIVE_KEY = /token|secret|password|credential|api.?key|access.?key|client.?id|private.?key/i
const LARGE_VALUE = /^(?:data:|[A-Za-z0-9+/]{300,}={0,2}$)/

export function householdDate(now = new Date(), timeZone = process.env.BREVITY_TIME_ZONE || 'America/New_York') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function sanitizeAuthoritativeContext(value, depth = 0) {
  if (depth > 8) return '[omitted]'
  if (Array.isArray(value)) return value.slice(0, 250).map(item => sanitizeAuthoritativeContext(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, item]) => [key, sanitizeAuthoritativeContext(item, depth + 1)]))
  }
  if (typeof value === 'string') {
    if (LARGE_VALUE.test(value)) return '[large value omitted]'
    return value.length > 6000 ? `${value.slice(0, 6000)}…` : value
  }
  return value
}

const compactMealDay = day => ({
  date: day.date,
  version: day.version,
  updatedAt: day.updatedAt,
  meals: Object.fromEntries(Object.entries(day.resolvedMeals || {}).map(([mealType, meal]) => [mealType, {
    id: meal?.id,
    name: meal?.name,
    description: meal?.description,
    macros: meal?.macros,
    macroBasis: meal?.macroBasis,
  }])),
})

const compactDailyPlan = plan => {
  if (!plan) return null
  const sermonNotes = plan.spiritual?.sermonNotes
  return {
    ...plan,
    spiritual: {
      ...(plan.spiritual || {}),
      sermonNotes: sermonNotes ? {
        title: sermonNotes.title,
        executiveSummary: sermonNotes.executiveSummary || sermonNotes.summary || '',
      } : undefined,
      devotionDocument: plan.spiritual?.devotionDocument ? {
        state: plan.spiritual.devotionDocument.state,
        name: plan.spiritual.devotionDocument.name,
        webUrl: plan.spiritual.devotionDocument.webUrl,
      } : undefined,
    },
  }
}

const sourceStatus = (id, label, result, asOf = '') => ({
  id,
  label,
  authority: 'canonical',
  state: result.status === 'fulfilled' && result.value ? 'available' : result.status === 'rejected' ? 'unavailable' : 'missing',
  asOf,
})

export async function buildAuthoritativeAssistantContext({
  member,
  date,
  now = new Date(),
  loadDailyPlan,
  loadMealWindow,
  loadActiveSermon,
}) {
  const [dailyPlanResult, mealResult, sermonResult] = await Promise.allSettled([
    loadDailyPlan(date),
    loadMealWindow(date),
    loadActiveSermon(),
  ])
  const dailyPlanRecord = dailyPlanResult.status === 'fulfilled' ? dailyPlanResult.value : null
  const dailyPlan = compactDailyPlan(dailyPlanRecord)
  const mealWindow = mealResult.status === 'fulfilled' ? mealResult.value : null
  const activeSermon = sermonResult.status === 'fulfilled' ? sermonResult.value : null
  const mealDays = (mealWindow?.days || []).map(compactMealDay)

  return sanitizeAuthoritativeContext({
    generatedAt: now.toISOString(),
    householdDate: date,
    signedInMember: member,
    sources: [
      sourceStatus('daily-plan', 'Household daily plan', dailyPlanResult, dailyPlanRecord?.updatedAt),
      sourceStatus('rolling-meals', 'Rolling seven-day meal plan', mealResult, mealDays.map(day => day.updatedAt).filter(Boolean).sort().at(-1) || ''),
      sourceStatus('active-sermon', 'Active spiritual formation source', sermonResult, activeSermon?.activatedAt),
    ],
    dailyPlan,
    rollingMealPlan: mealWindow ? {
      timeZone: mealWindow.timeZone,
      startDate: mealWindow.startDate,
      days: mealDays,
      nutritionNotice: 'Meal macros are estimates based on the saved meal definition and should not be treated as clinical nutrition calculations.',
    } : null,
    activeSermon: activeSermon ? {
      id: activeSermon.id,
      title: activeSermon.title || activeSermon.sermonNotes?.title,
      activatedAt: activeSermon.activatedAt,
      model: activeSermon.model,
      source: activeSermon.source,
      summary: activeSermon.sermonNotes?.executiveSummary || activeSermon.sermonNotes?.summary || '',
    } : null,
  })
}

export async function loadProductionAuthoritativeAssistantContext({ member, now = new Date() }) {
  const date = householdDate(now)
  const dataStore = getStore({
    name: HOUSEHOLD_STORE,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
  const meals = await productionMealPlanRepository()
  return buildAuthoritativeAssistantContext({
    member,
    date,
    now,
    loadDailyPlan: targetDate => dataStore.get(`${HOUSEHOLD_ID}/daily-plans/${targetDate}`, { type: 'json' }).catch(() => null),
    loadMealWindow: startDate => meals.getWindowReadOnly({ startDate, count: 7 }),
    loadActiveSermon: () => dataStore.get(ACTIVE_SERMON_KEY, { type: 'json' }).catch(() => null),
  })
}

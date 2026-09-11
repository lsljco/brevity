import { getStore } from '@netlify/blobs'
import { productionMealPlanRepository } from './meal-plan-store.mjs'
import { canonicalizeCalendarReadEvent } from '../../src/family/calendarNames.js'
import { budgetLineId } from '../../src/finance/budgetBreakdown.js'

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const HOUSEHOLD_STORE = 'brevity-household'
const SHARED_STORE = 'brevity-household-state'
const ACTION_SHARED_KEYS = ['lslj_finance_v9','lslj_budget_v1','brevity_finance_scenarios_v1','brevity_finance_debts_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1','homehq_items_v1','family_calendar_events_v1']
const ACTIVE_SERMON_KEY = `${HOUSEHOLD_ID}/spiritual/active-sermon`
const SENSITIVE_KEY = /token|secret|password|credential|api.?key|access.?key|client.?id|private.?key/i
const LARGE_VALUE = /^(?:data:|[A-Za-z0-9+/]{300,}={0,2}$)/
const missingBlob = error => error?.status === 404 || error?.statusCode === 404 || error?.name === 'NotFoundError'

export async function readOptionalAuthoritativeRecord(dataStore, key) {
  try {
    const entry = await dataStore.getWithMetadata(key, { type:'json' })
    return entry?.data || null
  } catch (error) {
    if (missingBlob(error)) return null
    throw error
  }
}

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

const parseSharedValue=record=>{try{return record?.value==null?null:JSON.parse(record.value)}catch{return null}}
const pick=(value,fields)=>Object.fromEntries(fields.filter(field=>value?.[field]!==undefined).map(field=>[field,value[field]]))
const compactProject=item=>pick(item,['id','title','notes','status','priority','startDate','due','raci','pushToFamilyCalendar','updatedAt'])
const compactCalendarEvent=item=>pick(canonicalizeCalendarReadEvent(item),['id','uid','sourceId','title','description','notes','date','time','endDate','endTime','allDay','owner','participants','members','priority','href','etag','updatedAt'])
const compactRecurring=item=>({
  ...pick(item,['id','name','title','notes','amount','type','cat','category','acct','accountId','freq','start','end','skips','owner','updatedAt']),
  budgetLineId:budgetLineId(item),
})
const compactForecast=model=>({expenseMode:model?.expenseMode,planningExpense:model?.planningExpense,scenarios:(model?.scenarios||[]).map(scenario=>({...pick(scenario,['id','title','description']),incomes:(scenario.incomes||[]).map(income=>pick(income,['id','description','monthlyNet','annualGross','contribution','remote','employment','notes']))}))})
const compactSharedRecords=records=>{
  const finance=parseSharedValue(records?.lslj_finance_v9)
  return {
    projects:(parseSharedValue(records?.homehq_items_v1)||[]).slice(0,250).map(compactProject),
    familyCalendarEvents:(parseSharedValue(records?.family_calendar_events_v1)||[]).slice(0,300).map(compactCalendarEvent),
    finance:{
      recurringRecords:(finance?.transactions||[]).filter(item=>item?.freq&&item.freq!=='once').slice(0,300).map(compactRecurring),
      budgets:parseSharedValue(records?.lslj_budget_v1)||{},
      forecasts:compactForecast(parseSharedValue(records?.brevity_finance_scenarios_v1)||{}),
      transactionOverrides:parseSharedValue(records?.lslj_tx_overrides_v1)||{},
      transactionRules:parseSharedValue(records?.lslj_tx_rules_v1)||[],
    },
    versions:Object.fromEntries(ACTION_SHARED_KEYS.map(key=>[key,Number(records?.[key]?.version||0)])),
  }
}

export async function buildAuthoritativeAssistantContext({
  member,
  date,
  now = new Date(),
  loadDailyPlan,
  loadMealWindow,
  loadActiveSermon,
  loadSharedRecords = async()=>({}),
}) {
  const [dailyPlanResult, mealResult, sermonResult, sharedResult] = await Promise.allSettled([
    loadDailyPlan(date),
    loadMealWindow(date),
    loadActiveSermon(),
    loadSharedRecords(),
  ])
  // An unavailable active-sermon source is not equivalent to having no
  // sermon. Stop Assistant context construction so it cannot replace retained
  // spiritual truth with generic content during a storage outage.
  if (sermonResult.status === 'rejected') throw sermonResult.reason
  const dailyPlanRecord = dailyPlanResult.status === 'fulfilled' ? dailyPlanResult.value : null
  const dailyPlan = compactDailyPlan(dailyPlanRecord)
  const mealWindow = mealResult.status === 'fulfilled' ? mealResult.value : null
  const activeSermonRecord = sermonResult.status === 'fulfilled' ? sermonResult.value : null
  const activeSermon = activeSermonRecord?.deleted ? null : activeSermonRecord
  const mealDays = (mealWindow?.days || []).map(compactMealDay)
  const sharedRecords=sharedResult.status==='fulfilled'?sharedResult.value:{}

  return sanitizeAuthoritativeContext({
    generatedAt: now.toISOString(),
    householdDate: date,
    signedInMember: member,
    sources: [
      sourceStatus('daily-plan', 'Household daily plan', dailyPlanResult, dailyPlanRecord?.updatedAt),
      sourceStatus('rolling-meals', 'Rolling seven-day meal plan', mealResult, mealDays.map(day => day.updatedAt).filter(Boolean).sort().at(-1) || ''),
      sourceStatus('active-sermon', 'Active spiritual formation source', sermonResult, activeSermon?.activatedAt),
      sourceStatus('shared-action-records', 'Projects, calendar, and finance administration records', sharedResult, Object.values(sharedRecords||{}).map(record=>record?.updatedAt).filter(Boolean).sort().at(-1)||''),
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
    actionRecords:compactSharedRecords(sharedRecords),
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
  const sharedStore=getStore({name:SHARED_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
  const meals = await productionMealPlanRepository()
  return buildAuthoritativeAssistantContext({
    member,
    date,
    now,
    loadDailyPlan: targetDate => dataStore.get(`${HOUSEHOLD_ID}/daily-plans/${targetDate}`, { type: 'json' }).catch(() => null),
    loadMealWindow: startDate => meals.getWindowReadOnly({ startDate, count: 7 }),
    loadActiveSermon: () => readOptionalAuthoritativeRecord(dataStore, ACTIVE_SERMON_KEY),
    loadSharedRecords: async()=>Object.fromEntries(await Promise.all(ACTION_SHARED_KEYS.map(async key=>[key,await sharedStore.get(`${HOUSEHOLD_ID}/records/${key}`,{type:'json'}).catch(()=>null)]))),
  })
}

import { canonicalizeCalendarReadEvent } from '../family/calendarNames.js'
import { migrateFinanceData } from '../finance/financeData.js'
import { applyTransactionRules } from '../finance/transactionRules.js'
import { PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisContextSignature } from './pillarAnalysisCache.js'

const ENDPOINT = '/.netlify/functions/pillar-analysis'
const REQUEST_TIMEOUT_MS = 45000
export const PILLAR_ANALYSIS_EVENT = 'brevity-pillar-analysis-refreshed'
const latestRequests = new Map()

function safeJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

export { PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisContextSignature } from './pillarAnalysisCache.js'
const memberSegment = member => String(member || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'unknown'
export const pillarAnalysisStorageKey = (date, pillar, member) => `brevity_pillar_analysis_v${PILLAR_ANALYSIS_SCHEMA_VERSION}_${date}_${pillar}_${memberSegment(member)}`

const PILLAR_IDS = ['spiritual', 'health', 'fitness', 'household', 'education', 'finance', 'ministry']

export function clearPillarAnalyses(date, storage = globalThis.localStorage, member = '') {
  if (!storage || !date) return
  if (member) {
    PILLAR_IDS.forEach(pillar => storage.removeItem(pillarAnalysisStorageKey(date, pillar, member)))
    return
  }
  const prefix = `brevity_pillar_analysis_v${PILLAR_ANALYSIS_SCHEMA_VERSION}_${date}_`
  const keys = []
  for (let index = 0; index < (storage.length || 0); index += 1) {
    const key = storage.key?.(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  keys.forEach(key => storage.removeItem(key))
}

export function readPillarAnalysis(date, pillar, member, storage = globalThis.localStorage, expectedContextSignature = '') {
  if (!storage || !date || !pillar || !member) return null
  const result = safeJson(storage.getItem(pillarAnalysisStorageKey(date, pillar, member)) || 'null', null)
  if (result?.schemaVersion !== PILLAR_ANALYSIS_SCHEMA_VERSION) return null
  if (memberSegment(result.member) !== memberSegment(member)) return null
  if (expectedContextSignature && result.contextSignature !== expectedContextSignature) return null
  return result
}

const valueArray = value => Array.isArray(value) ? value : []
const compactObject = (value, fields) => Object.fromEntries(fields.filter(field => value?.[field] !== undefined).map(field => [field, value[field]]))
const canonicalRecords = (records, limit = 250) => valueArray(records)
  .map(record => record && typeof record === 'object' ? record : null)
  .filter(Boolean)
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  .slice(0, limit)
const recentRecords = (records, limit = 250) => valueArray(records)
  .map(record => record && typeof record === 'object' ? record : null)
  .filter(Boolean)
  .sort((left, right) => String(right.date || right.authorized_date || '').localeCompare(String(left.date || left.authorized_date || ''))
    || JSON.stringify(left).localeCompare(JSON.stringify(right)))
  .slice(0, limit)

const compactTransaction = transaction => compactObject(transaction, [
  'id', 'transaction_id', 'date', 'authorized_date', 'amount', 'name', 'merchant_name',
  'originalStatement', 'original_description', 'category', 'cat', 'type', 'pending',
  'accountId', 'account_id', 'acct', 'accountName', 'institution', 'tags', 'splits', 'goal',
  'freq', 'frequency', 'start', 'end', 'dayOfWeek', 'dayOfMonth', 'skipDates', 'skips',
  'transferTo',
])
const compactAccount = account => compactObject(account, ['id', 'name', 'type', 'balance', 'plaidAccountId', 'institution'])
const compactRule = rule => compactObject(rule, ['id', 'conditions', 'actions', 'splits', 'applyToExisting', 'createdDate'])
const compactCalendarEvent = event => compactObject(event, [
  'id', 'sourceId', 'source', 'title', 'date', 'start', 'time', 'endTime', 'allDay',
  'owner', 'members', 'participants', 'status', 'notes', 'calendarName', 'recurrence',
])
const compactProject = project => compactObject(project, [
  'id', 'title', 'room', 'status', 'priority', 'owner', 'responsible', 'accountable',
  'consulted', 'informed', 'targetDate', 'dueDate', 'estcost', 'actcost', 'notes',
])
const compactInventoryItem = item => compactObject(item, [
  'id', 'name', 'category', 'location', 'quantity', 'unit', 'parLevel', 'unitCost',
  'expiresOn', 'notes', 'updatedBy',
])
const compactWaste = entry => compactObject(entry, [
  'id', 'itemId', 'name', 'category', 'quantity', 'unit', 'estimatedValue', 'reason',
  'recordedAt', 'recordedBy',
])
const compactScheduleItem = item => compactObject(item, [
  'id', 'title', 'date', 'days', 'startTime', 'endTime', 'owner', 'participants',
  'attendance', 'pillar', 'notes', 'active', 'frequency',
])
const compactOccurrence = occurrence => compactObject(occurrence, [
  'complete', 'coveredBy', 'exception', 'submittedAt', 'submittedBy', 'approvedAt',
  'approvedBy', 'returnedAt', 'returnedBy', 'returnReason',
])

function calendarContext(storage) {
  const legacy = safeJson(storage.getItem('family_calendar_events_v1') || '[]', [])
  const snapshot = safeJson(storage.getItem('brevity_icloud_calendar_cache_v1') || 'null', null)
  const appleEvents = Array.isArray(snapshot) ? snapshot : snapshot?.events
  return {
    brevityEvents:canonicalRecords(valueArray(legacy).map(canonicalizeCalendarReadEvent).map(compactCalendarEvent), 300),
    appleFamilyCalendar:canonicalRecords(valueArray(appleEvents).map(compactCalendarEvent), 300),
    appleCalendarName:snapshot?.calendar || '',
  }
}

function householdContext(storage) {
  const maintenance = safeJson(storage.getItem('brevity_household_maintenance_v1') || '{}', {})
  const inventory = safeJson(storage.getItem('brevity_household_inventory_v1') || '{}', {})
  const schedule = safeJson(storage.getItem('brevity_household_schedule_v1') || '{}', {})
  const occurrences = maintenance?.occurrences || maintenance?.completions || {}
  return {
    projects:canonicalRecords(valueArray(safeJson(storage.getItem('homehq_items_v1') || '[]', [])).map(compactProject), 250),
    calendar:calendarContext(storage),
    maintenance:{
      trackingStartedOn:maintenance?.trackingStartedOn || '',
      occurrences:Object.fromEntries(Object.entries(occurrences).map(([id, occurrence]) => [id, compactOccurrence(occurrence)])),
    },
    inventory:{
      items:canonicalRecords(valueArray(inventory?.items).map(compactInventoryItem), 200),
      waste:canonicalRecords(valueArray(inventory?.waste).map(compactWaste), 120),
    },
    schedule:{
      blocks:canonicalRecords(valueArray(schedule?.blocks).map(compactScheduleItem), 200),
      routines:canonicalRecords(valueArray(schedule?.routines).map(compactScheduleItem), 120),
      routineOverrides:schedule?.routineOverrides && typeof schedule.routineOverrides === 'object' ? schedule.routineOverrides : {},
    },
  }
}

export function collectPillarContextFromStorage(pillar, storage) {
  if (!storage) return {}
  if (pillar === 'finance') {
    const finance = migrateFinanceData(safeJson(storage.getItem('lslj_finance_v9') || '{}', {})) || {}
    const actuals = safeJson(storage.getItem('plaid_actuals_cache') || '[]', [])
    const budgets = safeJson(storage.getItem('lslj_budget_v1') || '{}', {})
    const budgetActuals = safeJson(storage.getItem('lslj_actuals_v1') || '{}', {})
    const transactionOverrides = safeJson(storage.getItem('lslj_tx_overrides_v1') || '{}', {})
    const transactionRules = safeJson(storage.getItem('lslj_tx_rules_v1') || '[]', [])
    const goals = safeJson(storage.getItem('fp_goals') || '[]', [])
    const accounts = valueArray(finance.accounts)
    const correctedActuals = valueArray(actuals)
      .map(transaction => applyTransactionRules(transaction, valueArray(transactionRules), accounts))
      .map(transaction => transactionOverrides[transaction.id] ? { ...transaction, ...transactionOverrides[transaction.id] } : transaction)
      .filter(transaction => !transaction._deleted)
      .map(compactTransaction)
    return {
      accounts:canonicalRecords(accounts.map(compactAccount), 50),
      scheduledTransactions:canonicalRecords(valueArray(finance.transactions).map(compactTransaction), 250),
      actualTransactions:recentRecords(correctedActuals, 250),
      actualTransactionCount:correctedActuals.length,
      sourceActualTransactionCount:valueArray(actuals).length,
      budgets,
      budgetActuals,
      transactionOverrides:canonicalRecords(Object.entries(transactionOverrides).map(([id, override]) => ({ id, ...compactTransaction(override), _deleted:Boolean(override?._deleted) })), 250),
      transactionRules:canonicalRecords(valueArray(transactionRules).map(compactRule), 100),
      goals:canonicalRecords(valueArray(goals), 100),
    }
  }
  if (pillar === 'household') return householdContext(storage)
  return {}
}

export function collectPillarContext(pillar) {
  if (typeof window === 'undefined') return {}
  return collectPillarContextFromStorage(pillar, window.localStorage)
}

export async function generatePillarAnalysis({
  pillar,
  date,
  plan,
  currentMember,
  force = false,
  localContext = collectPillarContext(pillar),
  fetcher = globalThis.fetch,
  storage = globalThis.localStorage,
  eventTarget = globalThis.window,
}) {
  const contextSignature = pillarAnalysisContextSignature({ pillarData:plan?.[pillar] || {}, localContext })
  const requestScope = `${date}:${pillar}:${memberSegment(currentMember)}`
  const requestToken = Symbol(requestScope)
  latestRequests.set(requestScope, requestToken)
  const isLatest = () => latestRequests.get(requestScope) === requestToken
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  try {
    response = await fetcher(ENDPOINT, {
      method:'POST',
      credentials:'include',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ pillar, date, plan, currentMember, force, localContext, contextSignature }),
      signal:controller.signal,
    })
  } catch (error) {
    if (!isLatest()) return null
    if (error?.name === 'AbortError') throw new Error(`${pillar} analysis timed out; the last saved analysis remains available.`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const body = await response.json().catch(() => ({}))
  if (!isLatest()) return null
  if (!response.ok) {
    const error = new Error(body.error || `Brevity AI returned ${response.status}.`)
    error.status = response.status
    throw error
  }
  if (body.contextSignature !== contextSignature) throw new Error('The pillar analysis source changed while Brevity was preparing it. Refresh the analysis to use the latest household data.')
  if (memberSegment(body.member) !== memberSegment(currentMember)) throw new Error('The pillar analysis was prepared for a different signed-in household member. Refresh after confirming the active profile.')
  if (storage?.setItem && isLatest()) {
    storage.setItem(pillarAnalysisStorageKey(date, pillar, currentMember), JSON.stringify(body))
    if (eventTarget?.dispatchEvent) {
      const event = typeof CustomEvent === 'function'
        ? new CustomEvent(PILLAR_ANALYSIS_EVENT, { detail: body })
        : { type:PILLAR_ANALYSIS_EVENT, detail:body }
      eventTarget.dispatchEvent(event)
    }
  }
  return body
}

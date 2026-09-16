const { getStore } = require('@netlify/blobs')
const { isDeepStrictEqual } = require('node:util')
const { readSession } = require('./household-auth')
const { sharedSpiritualValue } = require('../lib/spiritual-language.cjs')

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-household'
const ACTIVE_SERMON_KEY = `${HOUSEHOLD_ID}/spiritual/active-sermon`

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,OPTIONS',
}

function response(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) } }
function store() { return getStore({ name: STORE_NAME, consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_TOKEN }) }
function planKey(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('A valid YYYY-MM-DD date is required.'); return `${HOUSEHOLD_ID}/daily-plans/${date}` }
const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const values = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []
const addDays = (date, count) => {
  const [year,month,day] = String(date || '').split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + count))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}
const itemText = item => typeof item === 'string' ? clean(item) : clean(item?.detail || item?.description || item?.text || item?.label || item?.stage)
const missingBlob = error => error?.status === 404 || error?.statusCode === 404 || error?.name === 'NotFoundError'

async function readOptionalJSON(dataStore, key) {
  try {
    const entry = await dataStore.getWithMetadata(key, { type:'json' })
    return entry?.data || null
  } catch (error) {
    if (missingBlob(error)) return null
    throw error
  }
}

async function loadMemberPermissions(session) {
  if (session.role === 'admin') return null
  const { productionAssistantActionRepository } = await import('../lib/assistant-action-repository.mjs')
  const matrix = await productionAssistantActionRepository().getPermissions()
  return matrix?.[session.member] || {}
}

function hasFinancialPlanContent(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nested]) => key !== 'owner' && hasFinancialPlanContent(nested))
  }
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'boolean') return value
  return clean(value) !== ''
}

function canonicalFinancialPlanContent(value) {
  if (Array.isArray(value)) {
    const items = value.map(canonicalFinancialPlanContent).filter(item => item !== undefined)
    return items.length ? items : undefined
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key]) => key !== 'owner')
      .map(([key, nested]) => [key, canonicalFinancialPlanContent(nested)])
      .filter(([, nested]) => nested !== undefined)
    return entries.length ? Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right))) : undefined
  }
  if (typeof value === 'number') return value === 0 ? undefined : value
  if (typeof value === 'boolean') return value ? true : undefined
  const normalized = clean(value)
  return normalized || undefined
}

function financialPlanChanged(currentPlan, nextPlan) {
  const current = currentPlan?.finance && typeof currentPlan.finance === 'object' ? currentPlan.finance : {}
  const next = nextPlan?.finance && typeof nextPlan.finance === 'object' ? nextPlan.finance : {}
  if (!hasFinancialPlanContent(current) && !hasFinancialPlanContent(next)) return false
  return !isDeepStrictEqual(canonicalFinancialPlanContent(current), canonicalFinancialPlanContent(next))
}

function dailyPlanWritePermission({ session, memberPermissions, currentPlan, nextPlan }) {
  if (session?.role === 'admin') return { allowed:true, domain:'planning' }
  if (!memberPermissions?.planning) {
    return { allowed:false, domain:'planning', reason:`Planning changes are not enabled for ${session?.member || 'this member'}.` }
  }
  if (financialPlanChanged(currentPlan, nextPlan)) {
    return { allowed:false, domain:'finance', reason:'Financial administration requires household-administrator access.' }
  }
  return { allowed:true, domain:'planning' }
}

const scriptureReference = item => clean(typeof item === 'string' ? item : item?.reference || item?.scripture || item?.title)
function sermonScripturePool(activeSermon) {
  const notes = activeSermon?.sermonNotes || {}
  return [...values(notes.primaryScriptures), ...values(notes.supportingBiblicalWitnesses), ...values(notes.scriptureIndex)].map(scriptureReference).filter(Boolean)
}
function dayScripture(day, activeSermon, index) {
  const direct = clean(day?.scripture || day?.reference || day?.scriptureReference || day?.subtitle)
  if (direct) return [direct]
  const text = [...values(day?.paragraphs), ...values(day?.description), ...values(day?.steps)].map(itemText).join(' ')
  const inline = text.match(/\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d+(?::\d+(?:[-–]\d+)?)?/gi)
  if (inline?.length) return [...new Set(inline.map(clean))]
  const pool = sermonScripturePool(activeSermon)
  if (!pool.length) return []
  return [pool[index % pool.length]]
}
function sermonDevotion(activeSermon, date) {
  const sermonDate = String(activeSermon?.source?.sermonDate || activeSermon?.sermonNotes?.sermonDate || '').slice(0, 10)
  const rawDays = values(activeSermon?.sermonNotes?.sevenDayFormationPlan).slice(0, 7)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sermonDate) || !rawDays.length) return null
  const days = rawDays.map((day, index) => {
    const paragraphs = [...values(day?.description), ...values(day?.paragraphs), ...values(day?.details)].map(itemText).filter(Boolean)
    const practices = [...values(day?.steps), ...values(day?.actions), ...values(day?.items)].map(itemText).filter(Boolean)
    return sharedSpiritualValue({ day: index + 1, date: addDays(sermonDate, index), title: clean(day?.title) || `Day ${index + 1}`, scripture: dayScripture(day, activeSermon, index), devotionFocus: paragraphs.join('\n\n') || clean(day?.description || day?.detail), prayerFocus: practices.slice(0, 3), discussionPrompts: values(day?.discussionPrompts).map(itemText).filter(Boolean), obedienceAction: practices[0] || '', requiredOutput: practices[1] || practices[0] || '' })
  })
  const exact = days.find(day => day.date === date)
  if (exact) return exact
  if (date < days[0].date) return days[0]
  return days[days.length - 1]
}
async function getPlan(date, dataStore = store()) {
  const storedValue = await readOptionalJSON(dataStore, planKey(date))
  const activeSermonRecord = await readOptionalJSON(dataStore, ACTIVE_SERMON_KEY), activeSermon=activeSermonRecord?.deleted?null:activeSermonRecord
  if (!storedValue && !activeSermon?.sermonNotes) return null
  // A future daily-plan record may not exist yet. Return an unpersisted version-zero
  // shell so Next-Day Alignment still receives the reviewed weekly sermon authority.
  const value = storedValue || { id:`daily-plan-${date}`, date, version:0, spiritual:{} }
  const devotion = sermonDevotion(activeSermon, date)
  const existingSpiritual = sharedSpiritualValue(value.spiritual || {})
  if (!activeSermon?.sermonNotes) return value
  const retained={ ...existingSpiritual, owner: '', sermonNotes: sharedSpiritualValue(activeSermon.sermonNotes), sermonSource: { ...activeSermon.source, generatedAt: activeSermon.activatedAt, model: activeSermon.model, active: true, activeVersion:Number(activeSermon.version||0), sourceHash:activeSermon.source?.sourceHash||'', sharedHouseholdDevotion: true, devotionStartDate: daysStart(activeSermon) } }
  if (!devotion) return { ...value, spiritual:retained }
  return { ...value, spiritual: { ...retained, scripture: devotion.scripture, devotionFocus: devotion.devotionFocus, prayerFocus: devotion.prayerFocus, discussionPrompts: devotion.discussionPrompts, obedienceAction: devotion.obedienceAction, requiredOutput: devotion.requiredOutput, todayFocus: devotion.title, devotionDay: devotion.day, devotionDate: devotion.date, devotionTitle: devotion.title } }
}
function daysStart(activeSermon) { const sermonDate = String(activeSermon?.source?.sermonDate || activeSermon?.sermonNotes?.sermonDate || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(sermonDate) ? sermonDate : '' }
async function readPlanEntry(dataStore, date) {
  const entry = await dataStore.getWithMetadata(planKey(date), { type:'json' })
  return entry ? { plan:entry.data, etag:entry.etag || '' } : { plan:null, etag:'' }
}
async function putPlan(date, plan, expectedVersion, { session, memberPermissions, dataStore = store(), now = () => new Date() } = {}) {
  const entry = await readPlanEntry(dataStore, date)
  const current = entry.plan, currentVersion = Number(current?.version || 0)
  const permission = dailyPlanWritePermission({ session, memberPermissions, currentPlan:current, nextPlan:plan })
  if (!permission.allowed) return { forbidden:true, permission }
  if (current && (expectedVersion === undefined || expectedVersion === null)) return { conflict:true, conflictType:'missing-version', current }
  if (!Number.isInteger(Number(expectedVersion ?? 0)) || Number(expectedVersion ?? 0) < 0) return { invalidVersion:true }
  if (Number(expectedVersion ?? 0) !== currentVersion) return { conflict: true, conflictType:'version', current }
  if (current && !entry.etag) throw new Error('The household plan did not include a safe version marker.')
  // Recovery identity is server-owned. An ordinary browser save must never be
  // able to impersonate a completed Action Mode journal write.
  const timestamp = now().toISOString(), normalized = { ...plan, id: plan.id || `daily-plan-${date}`, date, householdId: HOUSEHOLD_ID, createdAt: plan.createdAt || timestamp, updatedAt: timestamp, updatedBy:session.member, lastActionId:'', version: currentVersion + 1 }
  const result = await dataStore.setJSON(planKey(date), normalized, current ? { onlyIfMatch:entry.etag } : { onlyIfNew:true })
  if (result?.modified === false) {
    const latest = (await readPlanEntry(dataStore, date)).plan
    return { conflict:true, conflictType:'version', current:latest }
  }
  return { conflict: false, plan: normalized }
}
exports.dailyPlanWritePermission = dailyPlanWritePermission
exports.getPlan = getPlan
exports.readOptionalJSON = readOptionalJSON
exports.putPlan = putPlan
exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  try {
    const session = await readSession(event); if (!session) return response(401, { error: 'Sign in to access the household plan.' }); const date = event.queryStringParameters?.date
    if (event.httpMethod === 'GET') return response(200, { householdId: HOUSEHOLD_ID, plan: await getPlan(date) })
    if (event.httpMethod === 'PUT') return response(409, { code:'ACTION_REVIEW_REQUIRED', error:'Direct daily-plan replacement is disabled. Review a granular change in Action Mode so Brevity can enforce permissions, retain audit history, support Undo, and stop on newer versions.' })
    return response(405, { error: 'Method not allowed.' })
  } catch (error) { console.error('[household-data]', error); return response(/valid YYYY-MM-DD/.test(error.message) ? 400 : 500, { error: error.message || 'Household data request failed.' }) }
}

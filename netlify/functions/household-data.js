const { getStore } = require('@netlify/blobs')
const { readSession } = require('./household-auth')

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-household'
const ACTIVE_SERMON_KEY = `${HOUSEHOLD_ID}/spiritual/active-sermon`

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
}

function response(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) } }
function store() { return getStore({ name: STORE_NAME, consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_TOKEN }) }
function planKey(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('A valid YYYY-MM-DD date is required.'); return `${HOUSEHOLD_ID}/daily-plans/${date}` }
const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const values = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []
const addDays = (date, count) => { const value = new Date(`${date}T12:00:00-04:00`); value.setDate(value.getDate() + count); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
const itemText = item => typeof item === 'string' ? clean(item) : clean(item?.detail || item?.description || item?.text || item?.label || item?.stage)

function sharedSpiritualText(value) {
  if (typeof value !== 'string') return value
  return value.replace(/Lorenzo owns this pillar and must lead the household/gi, 'This devotion belongs to every household member').replace(/Lorenzo must/gi, 'Each household member should').replace(/Lorenzo leads?/gi, 'the household practices').replace(/Lorenzo/gi, 'each household member')
}
function sharedSpiritualValue(value) { if (Array.isArray(value)) return value.map(sharedSpiritualValue); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sharedSpiritualValue(item)])); return sharedSpiritualText(value) }
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
    return sharedSpiritualValue({ day: index + 1, date: addDays(sermonDate, index + 1), title: clean(day?.title) || `Day ${index + 1}`, scripture: dayScripture(day, activeSermon, index), devotionFocus: paragraphs.join('\n\n') || clean(day?.description || day?.detail), prayerFocus: practices.slice(0, 3), discussionPrompts: values(day?.discussionPrompts).map(itemText).filter(Boolean), obedienceAction: practices[0] || '', requiredOutput: practices[1] || practices[0] || '' })
  })
  const exact = days.find(day => day.date === date)
  if (exact) return exact
  if (date < days[0].date) return days[0]
  return days[days.length - 1]
}
async function getPlan(date) {
  const dataStore = store(), value = await dataStore.get(planKey(date), { type: 'json' })
  if (!value) return null
  const activeSermon = await dataStore.get(ACTIVE_SERMON_KEY, { type: 'json' }).catch(() => null), devotion = sermonDevotion(activeSermon, date)
  if (!devotion) return value
  const existingSpiritual = sharedSpiritualValue(value.spiritual || {})
  return { ...value, spiritual: { ...existingSpiritual, owner: '', scripture: devotion.scripture, devotionFocus: devotion.devotionFocus, prayerFocus: devotion.prayerFocus, discussionPrompts: devotion.discussionPrompts, obedienceAction: devotion.obedienceAction, requiredOutput: devotion.requiredOutput, todayFocus: devotion.title, devotionDay: devotion.day, devotionDate: devotion.date, devotionTitle: devotion.title, sermonNotes: sharedSpiritualValue(activeSermon.sermonNotes), sermonSource: { ...activeSermon.source, generatedAt: activeSermon.activatedAt, model: activeSermon.model, active: true, sharedHouseholdDevotion: true, devotionStartDate: daysStart(activeSermon) } } }
}
function daysStart(activeSermon) { const sermonDate = String(activeSermon?.source?.sermonDate || activeSermon?.sermonNotes?.sermonDate || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(sermonDate) ? addDays(sermonDate, 1) : '' }
async function putPlan(date, plan, expectedVersion) {
  const dataStore = store(), current = await dataStore.get(planKey(date), { type: 'json' }).catch(() => null), currentVersion = Number(current?.version || 0)
  if (Number(expectedVersion || 0) !== currentVersion) return { conflict: true, current }
  const now = new Date().toISOString(), normalized = { ...plan, id: plan.id || `daily-plan-${date}`, date, householdId: HOUSEHOLD_ID, createdAt: plan.createdAt || now, updatedAt: now, version: currentVersion + 1 }
  await dataStore.setJSON(planKey(date), normalized); return { conflict: false, plan: normalized }
}
exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  try {
    const session = await readSession(event); if (!session) return response(401, { error: 'Sign in to access the household plan.' }); const date = event.queryStringParameters?.date
    if (event.httpMethod === 'GET') return response(200, { householdId: HOUSEHOLD_ID, plan: await getPlan(date) })
    if (event.httpMethod === 'PUT') { let body; try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error: 'Invalid JSON body.' }) }; const candidate = body.plan || body, result = await putPlan(date || body.date, candidate, body.expectedVersion ?? candidate.version ?? 0); if (result.conflict) return response(409, { error: 'Another device updated this household plan. Brevity loaded the latest version so you can review it before saving again.', householdId: HOUSEHOLD_ID, plan: result.current }); return response(200, { householdId: HOUSEHOLD_ID, plan: result.plan }) }
    return response(405, { error: 'Method not allowed.' })
  } catch (error) { console.error('[household-data]', error); return response(/valid YYYY-MM-DD/.test(error.message) ? 400 : 500, { error: error.message || 'Household data request failed.' }) }
}

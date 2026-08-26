const { getStore } = require('@netlify/blobs')
const { readSession } = require('./household-auth')

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-household'

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
}

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) }
}

function store() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
}

function planKey(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('A valid YYYY-MM-DD date is required.')
  return `${HOUSEHOLD_ID}/daily-plans/${date}`
}

async function getPlan(date) {
  const value = await store().get(planKey(date), { type: 'json' })
  return value || null
}

async function putPlan(date, plan, expectedVersion) {
  const dataStore = store()
  const current = await dataStore.get(planKey(date), { type: 'json' }).catch(() => null)
  const currentVersion = Number(current?.version || 0)
  if (Number(expectedVersion || 0) !== currentVersion) return { conflict: true, current }
  const now = new Date().toISOString()
  const normalized = {
    ...plan,
    id: plan.id || `daily-plan-${date}`,
    date,
    householdId: HOUSEHOLD_ID,
    createdAt: plan.createdAt || now,
    updatedAt: now,
    version: currentVersion + 1,
  }
  await dataStore.setJSON(planKey(date), normalized)
  return { conflict: false, plan: normalized }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }

  try {
    const session = await readSession(event)
    if (!session) return response(401, { error: 'Sign in to access the household plan.' })
    const date = event.queryStringParameters?.date

    if (event.httpMethod === 'GET') {
      const plan = await getPlan(date)
      return response(200, { householdId: HOUSEHOLD_ID, plan })
    }

    if (event.httpMethod === 'PUT') {
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error: 'Invalid JSON body.' }) }
      const candidate = body.plan || body
      const result = await putPlan(date || body.date, candidate, body.expectedVersion ?? candidate.version ?? 0)
      if (result.conflict) return response(409, { error: 'Another device updated this household plan. Brevity loaded the latest version so you can review it before saving again.', householdId: HOUSEHOLD_ID, plan: result.current })
      return response(200, { householdId: HOUSEHOLD_ID, plan: result.plan })
    }

    return response(405, { error: 'Method not allowed.' })
  } catch (error) {
    console.error('[household-data]', error)
    const status = /valid YYYY-MM-DD/.test(error.message) ? 400 : 500
    return response(status, { error: error.message || 'Household data request failed.' })
  }
}

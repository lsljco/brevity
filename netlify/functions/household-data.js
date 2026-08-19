const { getStore } = require('@netlify/blobs')

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-household'

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-brevity-family-key',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
}

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) }
}

function authorized(event) {
  const required = process.env.BREVITY_FAMILY_KEY
  if (!required) return true
  const supplied = event.headers?.['x-brevity-family-key'] || event.headers?.['X-Brevity-Family-Key'] || ''
  return supplied === required
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

async function putPlan(date, plan) {
  const now = new Date().toISOString()
  const normalized = {
    ...plan,
    id: plan.id || `daily-plan-${date}`,
    date,
    householdId: HOUSEHOLD_ID,
    createdAt: plan.createdAt || now,
    updatedAt: now,
    version: Number(plan.version || 0) + 1,
  }
  await store().setJSON(planKey(date), normalized)
  return normalized
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (!authorized(event)) return response(401, { error: 'Unauthorized household request.' })

  try {
    const date = event.queryStringParameters?.date

    if (event.httpMethod === 'GET') {
      const plan = await getPlan(date)
      return response(200, { householdId: HOUSEHOLD_ID, plan })
    }

    if (event.httpMethod === 'PUT') {
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error: 'Invalid JSON body.' }) }
      const plan = await putPlan(date || body.date, body.plan || body)
      return response(200, { householdId: HOUSEHOLD_ID, plan })
    }

    return response(405, { error: 'Method not allowed.' })
  } catch (error) {
    console.error('[household-data]', error)
    const status = /valid YYYY-MM-DD/.test(error.message) ? 400 : 500
    return response(status, { error: error.message || 'Household data request failed.' })
  }
}

import { normalizeDailyPlan } from './dailyPlan.js'

const ENDPOINT = '/.netlify/functions/household-data'
const REQUEST_TIMEOUT_MS = 20000

function headers() {
  return { 'content-type': 'application/json' }
}

async function parse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Household API returned ${response.status}.`)
  return body
}

export async function fetchDailyPlan(date) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${ENDPOINT}?date=${encodeURIComponent(date)}`, { headers: headers(), credentials: 'include', signal: controller.signal })
    const body = await parse(response)
    return body.plan ? normalizeDailyPlan(body.plan) : null
  } finally {
    clearTimeout(timeout)
  }
}

export async function saveDailyPlan(plan) {
  const normalized = normalizeDailyPlan(plan)
  const response = await fetch(`${ENDPOINT}?date=${encodeURIComponent(normalized.date)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: headers(),
    body: JSON.stringify({ plan: normalized }),
  })
  const body = await parse(response)
  return normalizeDailyPlan(body.plan)
}

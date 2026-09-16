import { normalizeDailyPlan } from './dailyPlan.js'

const ENDPOINT = '/.netlify/functions/household-data'
const REQUEST_TIMEOUT_MS = 20000

function headers() {
  return { 'content-type': 'application/json' }
}

async function parse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || `Household API returned ${response.status}.`)
    error.status = response.status
    error.currentPlan = body.plan || null
    throw error
  }
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

export function saveDailyPlan() {
  throw Object.assign(new Error('Direct daily-plan saves are disabled. Open Action Mode to review and apply this change.'), { code:'ACTION_REVIEW_REQUIRED' })
}

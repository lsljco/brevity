import { normalizeDailyPlan } from './dailyPlan.js'

const ENDPOINT = '/.netlify/functions/household-data'
const FAMILY_KEY_STORAGE = 'brevity_family_key'

function headers() {
  const familyKey = typeof window !== 'undefined' ? localStorage.getItem(FAMILY_KEY_STORAGE) : ''
  return {
    'content-type': 'application/json',
    ...(familyKey ? { 'x-brevity-family-key': familyKey } : {}),
  }
}

async function parse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Household API returned ${response.status}.`)
  return body
}

export function setFamilyKey(value) {
  if (typeof window === 'undefined') return
  if (value) localStorage.setItem(FAMILY_KEY_STORAGE, value)
  else localStorage.removeItem(FAMILY_KEY_STORAGE)
}

export async function fetchDailyPlan(date) {
  const response = await fetch(`${ENDPOINT}?date=${encodeURIComponent(date)}`, { headers: headers() })
  const body = await parse(response)
  return body.plan ? normalizeDailyPlan(body.plan) : null
}

export async function saveDailyPlan(plan) {
  const normalized = normalizeDailyPlan(plan)
  const response = await fetch(`${ENDPOINT}?date=${encodeURIComponent(normalized.date)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ plan: normalized }),
  })
  const body = await parse(response)
  return normalizeDailyPlan(body.plan)
}

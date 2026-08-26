import { fetchDailyPlan } from './householdApi.js'

const ENDPOINT = '/.netlify/functions/daily-household-plan-background'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function generateDailyPlan(date, { overwrite = false, timeoutMs = 90000 } = {}) {
  const requestId = globalThis.crypto?.randomUUID?.() || `daily-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, overwrite, requestId }),
  })

  if (!response.ok && response.status !== 202) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `Could not start daily plan generation (${response.status}).`)
  }

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    await wait(2500)
    const plan = await fetchDailyPlan(date)
    if (plan?.generationRequestId === requestId) return plan
  }

  throw new Error('Brevity is still preparing the daily plan. Refresh Today in a moment.')
}

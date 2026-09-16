const ENDPOINT = '/.netlify/functions/daily-household-plan-background'
const DRAFT_ENDPOINT = '/.netlify/functions/daily-household-plan-draft'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function fetchDailyPlanDraft(date, requestId) {
  const response = await fetch(`${DRAFT_ENDPOINT}?date=${encodeURIComponent(date)}&requestId=${encodeURIComponent(requestId)}`, { credentials:'include' })
  if (response.status === 404) return null
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Could not load the generated daily-plan draft (${response.status}).`)
  return payload.draft || null
}

export const fetchScheduledDailyPlanDraft = date => fetchDailyPlanDraft(date, `scheduled-${date}`)

export async function generateDailyPlan(date, { timeoutMs = 90000 } = {}) {
  const requestId = globalThis.crypto?.randomUUID?.() || `daily-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, requestId, authority:'draft-only' }),
  })

  if (!response.ok && response.status !== 202) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `Could not start daily plan generation (${response.status}).`)
  }

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    await wait(2500)
    const draft = await fetchDailyPlanDraft(date, requestId)
    if (draft?.requestId === requestId) return draft
  }

  throw new Error('Brevity is still preparing the draft. No shared daily-plan record was changed; try generating it again in a moment.')
}

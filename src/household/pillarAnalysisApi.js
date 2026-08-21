const ENDPOINT = '/.netlify/functions/pillar-analysis'
const REQUEST_TIMEOUT_MS = 45000
export const PILLAR_ANALYSIS_EVENT = 'brevity-pillar-analysis-refreshed'

function safeJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

export const pillarAnalysisStorageKey = (date, pillar) => `brevity_pillar_analysis_v1_${date}_${pillar}`

const PILLAR_IDS = ['spiritual', 'health', 'fitness', 'household', 'education', 'finance', 'ministry']

export function clearPillarAnalyses(date, storage = globalThis.localStorage) {
  if (!storage || !date) return
  PILLAR_IDS.forEach(pillar => storage.removeItem(pillarAnalysisStorageKey(date, pillar)))
}

export function readPillarAnalysis(date, pillar, storage = globalThis.localStorage) {
  if (!storage || !date || !pillar) return null
  return safeJson(storage.getItem(pillarAnalysisStorageKey(date, pillar)) || 'null', null)
}

export function collectPillarContextFromStorage(pillar, storage) {
  if (!storage) return {}
  if (pillar === 'finance') {
    const finance = safeJson(storage.getItem('lslj_finance_v9') || '{}', {})
    const actuals = safeJson(storage.getItem('plaid_actuals_cache') || '[]', [])
    const budgets = safeJson(storage.getItem('lslj_budget_v1') || '{}', {})
    const goals = safeJson(storage.getItem('fp_goals') || '[]', [])
    return {
      accounts: Array.isArray(finance.accounts) ? finance.accounts : [],
      scheduledTransactions: Array.isArray(finance.transactions) ? finance.transactions : [],
      actualTransactions: Array.isArray(actuals) ? actuals.slice(0, 250) : [],
      budgets,
      goals,
      syncedAt: storage.getItem('plaid_synced_at') || '',
    }
  }
  if (pillar === 'household') {
    return {
      projects: safeJson(storage.getItem('homehq_items_v1') || '[]', []),
      legacyCalendar: safeJson(storage.getItem('family_calendar_events_v1') || '[]', []),
    }
  }
  return {}
}

export function collectPillarContext(pillar) {
  if (typeof window === 'undefined') return {}
  return collectPillarContextFromStorage(pillar, window.localStorage)
}

export async function generatePillarAnalysis({ pillar, date, plan, currentMember, force = false }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  try {
    response = await fetch(ENDPOINT, {
      method:'POST',
      credentials:'include',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ pillar, date, plan, currentMember, force, localContext:collectPillarContext(pillar) }),
      signal:controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${pillar} analysis timed out; the last saved analysis remains available.`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || `Brevity AI returned ${response.status}.`)
    error.status = response.status
    throw error
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(pillarAnalysisStorageKey(date, pillar), JSON.stringify(body))
    window.dispatchEvent(new CustomEvent(PILLAR_ANALYSIS_EVENT, { detail: body }))
  }
  return body
}

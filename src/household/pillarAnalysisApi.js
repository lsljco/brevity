const ENDPOINT = '/.netlify/functions/pillar-analysis'

function safeJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

export function collectPillarContext(pillar) {
  if (typeof window === 'undefined') return {}
  if (pillar === 'finance') {
    const accounts = safeJson(localStorage.getItem('fp_accounts') || '[]', [])
    const transactions = safeJson(localStorage.getItem('fp_transactions') || '[]', [])
    const budgets = safeJson(localStorage.getItem('fp_budgets') || '[]', [])
    const goals = safeJson(localStorage.getItem('fp_goals') || '[]', [])
    return { accounts, transactions: Array.isArray(transactions) ? transactions.slice(-60) : [], budgets, goals }
  }
  if (pillar === 'household') {
    return {
      projects: safeJson(localStorage.getItem('homehq_items_v1') || '[]', []),
      legacyCalendar: safeJson(localStorage.getItem('family_calendar_events_v1') || '[]', []),
    }
  }
  return {}
}

export async function generatePillarAnalysis({ pillar, date, plan, currentMember, force = false }) {
  const response = await fetch(ENDPOINT, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ pillar, date, plan, currentMember, force, localContext:collectPillarContext(pillar) }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || `Brevity AI returned ${response.status}.`)
    error.status = response.status
    throw error
  }
  return body
}

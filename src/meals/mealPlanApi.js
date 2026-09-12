const ENDPOINT = '/.netlify/functions/meal-plans'
const ACTION_ENDPOINT = '/.netlify/functions/brevity-assistant-actions'
const REQUEST_TIMEOUT_MS = 20000

async function request(url, { timeoutMs = REQUEST_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { credentials: 'include', ...options, signal: controller.signal })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(body.error || `Meal-plan API returned ${response.status}.`)
      error.status = response.status
      throw error
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

export function fetchRollingMealPlan(startDate) {
  const query = startDate ? `?startDate=${encodeURIComponent(startDate)}` : ''
  return request(`${ENDPOINT}${query}`)
}

export function createMealLibraryItem(meal) {
  return request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(meal),
  })
}

export function calculateMealNutrition(ingredients, yieldQuantity, yieldUnit) {
  return request('/.netlify/functions/meal-nutrition', {
    timeoutMs: 45000,
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ ingredients, yieldQuantity, yieldUnit }),
  })
}

export function prepareMealSubstitution({ date, mealType, mealId, expectedVersion }) {
  return request(`${ACTION_ENDPOINT}?action=prepare-meal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, mealType, mealId, expectedVersion }),
  })
}

export function executeMealSubstitution(proposalId) {
  return request(`${ACTION_ENDPOINT}?action=execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposalId, confirmed: true }),
  })
}

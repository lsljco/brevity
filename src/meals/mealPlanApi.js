const ENDPOINT = '/.netlify/functions/meal-plans'
const REQUEST_TIMEOUT_MS = 20000

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
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

export function substituteMeal({ date, mealType, mealId, expectedVersion }) {
  return request(ENDPOINT, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, mealType, mealId, expectedVersion }),
  })
}

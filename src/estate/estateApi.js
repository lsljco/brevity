const ENDPOINT = '/.netlify/functions/estate-data'
const REQUEST_TIMEOUT_MS = 20000

async function request(query) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${ENDPOINT}?${new URLSearchParams(query)}`, { credentials: 'include', signal: controller.signal })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.error || `Estate request failed (${response.status}).`)
      error.status = response.status
      throw error
    }
    return payload
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Estate records took too long to load. The legacy Malbec application remains available.')
    throw error
  } finally { clearTimeout(timeout) }
}

export function fetchEstateSummary(propertyId) {
  return request({ action: 'summary', ...(propertyId ? { propertyId } : {}) })
}

export function fetchEstateEntities(entityType, propertyId) {
  return request({ entityType, ...(propertyId ? { propertyId } : {}) })
}

export function fetchHomeHQBridgeAudit(propertyId) {
  return request({ action: 'homehq-bridge', ...(propertyId ? { propertyId } : {}) })
}

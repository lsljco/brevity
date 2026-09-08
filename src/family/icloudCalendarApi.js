const ENDPOINT = '/.netlify/functions/icloud-calendar'
const REQUEST_TIMEOUT_MS = 20000

async function request(method, body, query = '') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${ENDPOINT}${query}`, {
      method,
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.error || `Calendar request failed (${response.status}).`)
      error.status = response.status
      throw error
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Calendar refresh timed out; cached events remain available.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function loginFamilyCalendar(pin) { return request('POST', { pin }, '?action=login') }
export function fetchICloudCalendarEvents() { return request('GET') }

function reviewedActionRequired() {
  const error = new Error('Direct Family Calendar changes are unavailable. Use Action Mode to review and apply calendar changes with permissions, audit history, safe Undo, and version-conflict protection.')
  error.status = 423
  error.code = 'ACTION_REVIEW_REQUIRED'
  throw error
}

export async function createICloudCalendarEvent() { reviewedActionRequired() }
export async function updateICloudCalendarEvent() { reviewedActionRequired() }
export async function deleteICloudCalendarEvent() { reviewedActionRequired() }

export function isCalendarEligible(item) {
  return Boolean(item?.calendarSync && item?.title && (item?.date || item?.dueAt || item?.startTime))
}

export function planItemToCalendarEvent(item, planDate, pillar = 'household', sourceId = item.id) {
  return {
    sourceId,
    title: item.title,
    date: item.date || item.dueAt?.slice?.(0, 10) || planDate,
    time: item.startTime || '',
    allDay: !item.startTime,
    pillar,
    owner: item.owner || 'Family',
    participants: item.participants || [],
    priority: item.priority === 'high' || item.priority === 'critical',
  }
}

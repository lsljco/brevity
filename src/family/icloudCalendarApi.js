const ENDPOINT = '/.netlify/functions/icloud-calendar'

async function request(method, body, query = '') {
  const response = await fetch(`${ENDPOINT}${query}`, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || `Calendar request failed (${response.status}).`)
    error.status = response.status
    throw error
  }
  return payload
}

export function loginFamilyCalendar(pin) {
  return request('POST', { pin }, '?action=login')
}

export function fetchICloudCalendarEvents() {
  return request('GET')
}

export function createICloudCalendarEvent(event) {
  return request('POST', event)
}

export function updateICloudCalendarEvent(event) {
  return request('PUT', event)
}

export function deleteICloudCalendarEvent(event) {
  return request('DELETE', event)
}

export function isCalendarEligible(item) {
  return Boolean(item?.calendarSync && item?.title && (item?.date || item?.dueAt || item?.startTime))
}

export function planItemToCalendarEvent(item, planDate, pillar = 'household') {
  return {
    sourceId: item.id,
    title: item.title,
    date: item.date || item.dueAt?.slice?.(0, 10) || planDate,
    time: item.startTime || '',
    allDay: !item.startTime,
    pillar,
    priority: item.priority === 'high' || item.priority === 'critical',
  }
}

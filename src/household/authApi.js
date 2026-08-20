const ENDPOINT = '/.netlify/functions/household-auth'

async function request(method, action, body) {
  const response = await fetch(`${ENDPOINT}?action=${encodeURIComponent(action)}`, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || `Authentication request failed (${response.status}).`)
    error.status = response.status
    throw error
  }
  return payload
}

export const fetchHouseholdSession = () => request('GET', 'session')
export const fetchHouseholdMembers = () => request('GET', 'members')
export const bootstrapHousehold = password => request('POST', 'bootstrap', { member: 'Larry', password })
export const loginHouseholdMember = (member, password) => request('POST', 'login', { member, password })
export const logoutHouseholdMember = () => request('POST', 'logout', {})
export const setHouseholdMemberPassword = (member, password) => request('POST', 'set-member-password', { member, password })

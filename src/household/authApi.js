const ENDPOINT = '/.netlify/functions/household-auth'

async function request(method, action, body) {
  const response = await fetch(`${ENDPOINT}?action=${encodeURIComponent(action)}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
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
async function establishSession(action, member, password) {
  await request('POST', action, { member, password })
  // A password response alone does not prove the browser retained the HttpOnly
  // cookie. Only a separate authenticated request may open household screens.
  const session = await fetchHouseholdSession()
  if (session.authenticated !== true || session.member !== member) {
    const error = new Error('Your password was accepted, but this browser could not retain your sign-in session. Open Brevity directly in your browser with site cookies enabled, then sign in again.')
    error.code = 'SESSION_NOT_RETAINED'
    throw error
  }
  return session
}
export const bootstrapHousehold = password => establishSession('bootstrap', 'Larry', password)
export const loginHouseholdMember = (member, password) => establishSession('login', member, password)
export const setHouseholdMemberPassword = ({ member, currentPassword, newPassword }) => request('POST', 'set-member-password', { member, currentPassword, newPassword })
export const logoutHouseholdMember = () => request('POST', 'logout', {})

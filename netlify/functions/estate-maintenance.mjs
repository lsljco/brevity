import householdAuth from './household-auth.js'

const { readSession } = householdAuth

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST,OPTIONS',
}

const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

/**
 * Estate maintenance previously wrote the durable Estate workspace directly
 * and then published a second Calendar record. That path had version checks,
 * but it did not have Action Mode review, immutable Action History, or safe
 * Undo. Keep the endpoint so older clients fail truthfully before either
 * authoritative store is touched.
 */
export function createEstateMaintenanceHandler({ authenticate = readSession } = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
    const session = await authenticate(event).catch(() => null)
    if (!session) return response(401, { error: 'Sign in to access Estate maintenance.' })
    if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' })
    return response(423, {
      error: 'Estate maintenance changes are read-only until reviewed Action Mode, Audit History, safe Undo, and atomic Calendar publication are available.',
      code: 'ACTION_MODE_REQUIRED',
      domain: 'projects',
    })
  }
}

export const handler = createEstateMaintenanceHandler()

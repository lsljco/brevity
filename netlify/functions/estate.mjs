import householdAuth from './household-auth.js'
import { productionEstateRepository } from '../lib/estate-store.mjs'
import { MALBEC_PROPERTY_ID } from '../../src/estate/estateModel.js'
import { transformMalbecBackup } from '../../src/estate/malbecMigration.js'

const { readSession } = householdAuth
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

export function createEstateHandler({
  authenticate = readSession,
  repositoryFactory = productionEstateRepository,
  transform = transformMalbecBackup,
} = {}) {
  return async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  try {
    const session = await authenticate(event)
    if (!session) return response(401, { error: 'Sign in to access Estate records.' })
    const propertyId = String(event.queryStringParameters?.propertyId || MALBEC_PROPERTY_ID)

    if (event.httpMethod === 'GET') {
      const repository = await repositoryFactory()
      const workspace = await repository.getWorkspace(propertyId)
      return response(200, { propertyId, workspace })
    }

    if (event.httpMethod === 'POST') {
      if (session.role !== 'admin') return response(403, { error: 'Household administrator access is required for legacy imports.' })
      if (Buffer.byteLength(event.body || '', 'utf8') > 5_000_000) return response(413, { error: 'This structured-data import is too large. Embedded files must be migrated through the Estate document pipeline.' })
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error: 'Invalid JSON body.' }) }
      if (body.commit === true) return response(423, {
        code: 'ACTION_REVIEW_REQUIRED',
        error: 'Creating or replacing Estate records is unavailable in this release because the import is not yet protected by Action Mode review, audit history, safe Undo, and version-conflict recovery. No Estate records were changed.',
      })
      const transformed = transform(body.backup, { propertyId, sourceInspection: body.sourceInspection })
      return response(200, { dryRun: true, ...transformed })
    }

    return response(405, { error: 'Method not allowed.' })
  } catch (error) {
    console.error('[estate]', error)
    const status = error.code === 'VERSION_CONFLICT' ? 409 : error.code === 'VALIDATION_ERROR' ? 400 : 500
    return response(status, { error: error.message || 'Estate records are temporarily unavailable.' })
  }
}
}

export const handler = createEstateHandler()

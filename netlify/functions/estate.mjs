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
    const repository = await repositoryFactory()
    const propertyId = String(event.queryStringParameters?.propertyId || MALBEC_PROPERTY_ID)

    if (event.httpMethod === 'GET') {
      const workspace = await repository.getWorkspace(propertyId)
      return response(200, { propertyId, workspace })
    }

    if (event.httpMethod === 'POST') {
      if (session.role !== 'admin') return response(403, { error: 'Household administrator access is required for legacy imports.' })
      if (Buffer.byteLength(event.body || '', 'utf8') > 5_000_000) return response(413, { error: 'This structured-data import is too large. Embedded files must be migrated through the Estate document pipeline.' })
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error: 'Invalid JSON body.' }) }
      const transformed = transform(body.backup, { propertyId, sourceInspection: body.sourceInspection })
      if (body.commit !== true) return response(200, { dryRun: true, ...transformed })
      if (!transformed.report.sourceInspection?.sourceChecksum) return response(400, { error: 'A verified source export checksum is required before import.' })
      if (Number(transformed.report.counts.workOrders || 0) + Number(transformed.report.counts.projects || 0) === 0) return response(400, { error: 'At least one maintenance or project record is required for the initial import.' })
      if (transformed.report.sourceInspection?.blockingIssues?.length) return response(400, { error: transformed.report.sourceInspection.blockingIssues.join(' ') })
      if (await repository.getWorkspace(propertyId)) return response(409, { error: 'Malbec Estate already has a durable workspace. Use reconciliation instead of replacing the existing import.' })
      const saved = await repository.saveWorkspace({
        workspace: transformed.workspace,
        expectedVersion: body.expectedVersion,
        actor: session.member,
        reason: 'estate.malbec-imported',
      })
      return response(201, { dryRun: false, workspace: saved, report: transformed.report })
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

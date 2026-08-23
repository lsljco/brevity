import householdAuth from './household-auth.js'
import { auditHomeHQBridge } from '../lib/homehq-bridge.mjs'
import { createEstateRepository } from '../lib/estate-store.mjs'
import { isEstateEntityType } from '../../src/estate/estateModel.js'

const { readSession } = householdAuth
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const MAX_BODY_BYTES = 1_000_000

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
})

function parseBody(event) {
  if (Buffer.byteLength(event.body || '', 'utf8') > MAX_BODY_BYTES) {
    const error = new Error('Estate request is too large. Files must be uploaded separately from record metadata.')
    error.status = 413
    throw error
  }
  try { return JSON.parse(event.body || '{}') } catch {
    const error = new Error('Invalid JSON request body.')
    error.status = 400
    throw error
  }
}
export const handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' }
  const session = await readSession(event).catch(() => null)
  if (!session) return json(401, { error: 'Sign in to access Estate records.' })
  const repository = createEstateRepository({ householdId: HOUSEHOLD_ID })
  const query = event.queryStringParameters || {}
  const action = query.action || ''

  try {
    if (event.httpMethod === 'GET' && action === 'summary') return json(200, await repository.summary(query.propertyId))
    if (event.httpMethod === 'GET' && action === 'export') {
      if (session.role !== 'admin') return json(403, { error: 'Household administrator access is required to export Estate records.' })
      return json(200, await repository.exportAll())
    }
    if (event.httpMethod === 'GET' && action === 'homehq-bridge') {
      if (session.role !== 'admin') return json(403, { error: 'Household administrator access is required to audit HomeHQ migration data.' })
      return json(200, await auditHomeHQBridge({ householdId: HOUSEHOLD_ID, propertyId: query.propertyId }))
    }

    const entityType = query.entityType
    if (!isEstateEntityType(entityType)) return json(400, { error: 'Choose a valid Estate entity type.' })

    if (event.httpMethod === 'GET') {
      if (query.id) {
        const entity = await repository.get(entityType, query.id)
        return entity ? json(200, { entity }) : json(404, { error: 'Estate record not found.' })
      }
      const entities = await repository.list(entityType, { propertyId: query.propertyId, includeArchived: query.includeArchived === 'true' && session.role === 'admin' })
      return json(200, { entityType, entities })
    }

    if (session.role !== 'admin') return json(403, { error: 'Estate changes currently require household administrator access.' })

    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
      const body = parseBody(event)
      const expectedVersion = event.httpMethod === 'POST' ? 0 : body.expectedVersion
      const entity = await repository.save({ entityType, entity: body.entity || body, expectedVersion, actor: session.member })
      return json(event.httpMethod === 'POST' ? 201 : 200, { entity })
    }

    if (event.httpMethod === 'DELETE') {
      const body = parseBody(event)
      const id = query.id || body.id
      if (!id) return json(400, { error: 'Estate record id is required.' })
      const entity = await repository.archive({ entityType, id, expectedVersion: body.expectedVersion, actor: session.member })
      return json(200, { entity, archived: true })
    }

    return json(405, { error: 'Method not allowed.' })
  } catch (error) {
    console.error('[estate-data]', error)
    return json(error.status || (error.name === 'EstateValidationError' ? 400 : 500), {
      error: error.message || 'Estate records are temporarily unavailable.',
      errors: error.errors,
      current: error.current,
    })
  }
}

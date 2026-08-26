import { randomUUID } from 'node:crypto'
import householdAuth from './household-auth.js'
import { productionEstateRepository } from '../lib/estate-store.mjs'
import { MALBEC_PROPERTY_ID } from '../../src/estate/estateModel.js'
import { createMaintenancePlanCycle, transitionMaintenanceEvent } from '../../src/estate/estateMaintenance.js'

const { readSession } = householdAuth
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const clean = (value, length = 180) => String(value || '').replace(/[\u0000-\u001f]/g, '').slice(0, length)

function parseBody(event) {
  if (Buffer.byteLength(event.body || '', 'utf8') > 100_000) throw Object.assign(new Error('Estate maintenance requests must be smaller than 100 KB.'), { statusCode: 413 })
  try { return JSON.parse(event.body || '{}') } catch { throw Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }) }
}

function linkCalendar(workspace, body, now) {
  const eventId = clean(body.eventId)
  const index = workspace.maintenanceEvents.findIndex(event => event.id === eventId)
  if (index === -1) throw Object.assign(new Error('That maintenance event was not found.'), { statusCode: 404 })
  const calendarLink = body.calendarLink || {}
  if (!clean(calendarLink.id) || !String(calendarLink.href || '').startsWith('/')) throw Object.assign(new Error('A valid Family Calendar link is required.'), { statusCode: 400 })
  const event = workspace.maintenanceEvents[index]
  const linked = {
    ...event,
    updatedAt: now,
    calendar: {
      ...event.calendar,
      id: clean(calendarLink.id),
      href: clean(calendarLink.href, 500),
      etag: clean(calendarLink.etag, 240) || null,
      syncedAt: now,
    },
  }
  const maintenanceEvents = [...workspace.maintenanceEvents]
  maintenanceEvents[index] = linked
  return { workspace: { ...workspace, maintenanceEvents }, event: linked }
}

export function createEstateMaintenanceHandler({
  authenticate = readSession,
  repositoryFactory = productionEstateRepository,
  now = () => new Date(),
  createId = randomUUID,
} = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
    try {
      const session = await authenticate(event)
      if (!session) return response(401, { error: 'Sign in to manage Estate maintenance.' })
      if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' })
      const body = parseBody(event)
      const propertyId = clean(event.queryStringParameters?.propertyId || body.propertyId || MALBEC_PROPERTY_ID)
      const repository = await repositoryFactory()
      const workspace = await repository.getWorkspace(propertyId)
      if (!workspace) return response(404, { error: 'Create the durable Estate workspace before managing maintenance.' })
      const occurredAt = now().toISOString()
      let result
      let reason
      let statusCode = 200

      if (body.action === 'create-plan') {
        if (session.role !== 'admin') return response(403, { error: 'Household administrator access is required to create maintenance plans.' })
        result = createMaintenancePlanCycle(workspace, body.plan, { now: occurredAt, createId })
        reason = 'estate.maintenance-plan-created'
        statusCode = 201
      } else if (body.action === 'transition-event') {
        result = transitionMaintenanceEvent(workspace, body, { now: occurredAt, createId })
        reason = `estate.maintenance-${body.status}`
      } else if (body.action === 'link-calendar') {
        result = linkCalendar(workspace, body, occurredAt)
        reason = 'estate.maintenance-calendar-linked'
      } else {
        return response(400, { error: 'Estate maintenance action must create a plan, transition an event, or link a calendar event.' })
      }

      const saved = await repository.saveWorkspace({
        workspace: result.workspace,
        expectedVersion: body.expectedVersion,
        actor: session.member,
        reason,
      })
      return response(statusCode, { workspace: saved, plan: result.plan || null, event: result.event || null, workOrder: result.workOrder || null, generated: result.generated || null })
    } catch (error) {
      console.error('[estate-maintenance]', error)
      const status = error.statusCode || (error.code === 'VERSION_CONFLICT' ? 409 : error.code === 'VALIDATION_ERROR' ? 400 : /required|must|valid|not found/i.test(error.message) ? 400 : 500)
      return response(status, { error: error.message || 'Estate maintenance is temporarily unavailable.' })
    }
  }
}

export const handler = createEstateMaintenanceHandler()

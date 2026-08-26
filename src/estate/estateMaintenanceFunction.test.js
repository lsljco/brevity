import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateMaintenanceHandler } from '../../netlify/functions/estate-maintenance.mjs'
import { createEstateRepository } from '../../netlify/lib/estate-store.mjs'
import { createEstateWorkspace } from './estateModel.js'

function memoryStore() {
  const records = new Map()
  return { async get(key) { return records.get(key) ?? null }, async setJSON(key, value) { records.set(key, structuredClone(value)) } }
}

const request = body => ({ httpMethod: 'POST', queryStringParameters: { propertyId: 'property-malbec-estate' }, body: JSON.stringify(body) })

async function fixture(role = 'admin') {
  const repository = createEstateRepository({ store: memoryStore(), now: () => new Date('2026-08-26T12:00:00.000Z'), createId: () => 'audit' })
  const workspace = createEstateWorkspace()
  workspace.systems = [{ id: 'system-hvac', propertyId: workspace.propertyId, name: 'HVAC' }]
  await repository.saveWorkspace({ workspace, expectedVersion: 0, actor: 'Larry', reason: 'test.setup' })
  let id = 0
  const handler = createEstateMaintenanceHandler({
    authenticate: async () => ({ member: role === 'admin' ? 'Larry' : 'Terica', role }),
    repositoryFactory: async () => repository,
    now: () => new Date('2026-08-27T12:00:00.000Z'),
    createId: () => String(++id),
  })
  return { repository, handler }
}

test('maintenance API requires authentication and admin access for plan creation', async () => {
  const unauthenticated = createEstateMaintenanceHandler({ authenticate: async () => null })
  assert.equal((await unauthenticated(request({}))).statusCode, 401)
  const { handler } = await fixture('member')
  assert.equal((await handler(request({ action: 'create-plan' }))).statusCode, 403)
})

test('creates, audits, and transitions durable maintenance records', async () => {
  const { handler } = await fixture()
  const created = await handler(request({ action: 'create-plan', expectedVersion: 1, plan: {
    title: 'Seasonal HVAC service', systemId: 'system-hvac', nextDueDate: '2026-09-01', recurrence: { interval: 6, unit: 'months' }, responsibleMember: 'Larry', calendarSyncEnabled: true,
  } }))
  assert.equal(created.statusCode, 201)
  const createdBody = JSON.parse(created.body)
  assert.equal(createdBody.workspace.version, 2)
  assert.equal(createdBody.workspace.maintenancePlans.length, 1)
  assert.equal(createdBody.workspace.workOrders.length, 1)
  const transitioned = await handler(request({ action: 'transition-event', eventId: createdBody.event.id, status: 'scheduled', expectedVersion: 2 }))
  assert.equal(transitioned.statusCode, 200)
  assert.equal(JSON.parse(transitioned.body).workspace.version, 3)
})

test('calendar links require an Apple href and preserve optimistic concurrency', async () => {
  const { handler } = await fixture()
  const created = JSON.parse((await handler(request({ action: 'create-plan', expectedVersion: 1, plan: {
    title: 'Seasonal HVAC service', systemId: 'system-hvac', nextDueDate: '2026-09-01', recurrence: { interval: 6, unit: 'months' },
  } }))).body)
  const invalid = await handler(request({ action: 'link-calendar', eventId: created.event.id, expectedVersion: 2, calendarLink: { id: 'calendar-1', href: 'https://attacker.example/event' } }))
  assert.equal(invalid.statusCode, 400)
  const linked = await handler(request({ action: 'link-calendar', eventId: created.event.id, expectedVersion: 2, calendarLink: { id: 'calendar-1', href: '/family/calendar-1.ics', etag: 'one' } }))
  assert.equal(linked.statusCode, 200)
  assert.equal(JSON.parse(linked.body).workspace.maintenanceEvents[0].calendar.href, '/family/calendar-1.ics')
  const stale = await handler(request({ action: 'transition-event', eventId: created.event.id, status: 'scheduled', expectedVersion: 2 }))
  assert.equal(stale.statusCode, 409)
})

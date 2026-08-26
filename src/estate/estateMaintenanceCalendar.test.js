import assert from 'node:assert/strict'
import test from 'node:test'
import { syncEstateMaintenanceToFamilyCalendar } from './estateMaintenanceCalendar.js'

const input = {
  event: { id: 'event-1', scheduledFor: '2026-09-01', status: 'due', responsibleMember: 'Terica', calendar: { syncEnabled: true, sourceId: 'estate-maintenance-event-1' } },
  plan: { id: 'plan-1', title: 'HVAC service' },
  workOrder: { id: 'work-1', title: 'HVAC service', priority: 'medium' },
  propertyName: 'Malbec Estate',
}

test('creates a Family Calendar event when the maintenance source is new', async () => {
  const calls = []
  const result = await syncEstateMaintenanceToFamilyCalendar(input, {
    fetch: async () => ({ events: [] }),
    create: async event => { calls.push(event); return { id: 'icloud-1', href: '/family/icloud-1.ics', etag: 'one' } },
  })
  assert.equal(calls[0].owner, 'Terica')
  assert.equal(calls[0].sourceId, 'estate-maintenance-event-1')
  assert.equal(result.href, '/family/icloud-1.ics')
})

test('updates the matching Family Calendar event instead of creating a duplicate', async () => {
  const calls = []
  const result = await syncEstateMaintenanceToFamilyCalendar(input, {
    fetch: async () => ({ events: [{ id: 'icloud-1', sourceId: 'estate-maintenance-event-1', href: '/family/icloud-1.ics', etag: 'one' }] }),
    update: async event => { calls.push(event); return { etag: 'two' } },
  })
  assert.equal(calls[0].href, '/family/icloud-1.ics')
  assert.equal(result.id, 'icloud-1')
  assert.equal(result.etag, 'two')
})

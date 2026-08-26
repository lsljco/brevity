import assert from 'node:assert/strict'
import test from 'node:test'
import { addMaintenanceRecurrence, createMaintenancePlanCycle, maintenanceCalendarEvent, transitionMaintenanceEvent } from './estateMaintenance.js'
import { createEstateWorkspace, estateWorkspaceSummary, validateEstateWorkspace } from './estateModel.js'

function fixture() {
  const workspace = createEstateWorkspace({ propertyId: 'property-1', propertyName: 'Malbec Estate' })
  workspace.systems = [{ id: 'system-pool', propertyId: workspace.propertyId, name: 'Pool & Wellness' }]
  workspace.assets = [{ id: 'asset-filter', propertyId: workspace.propertyId, systemId: 'system-pool', name: 'Pool filter' }]
  workspace.vendors = [{ id: 'vendor-pool', propertyId: workspace.propertyId, name: 'Pool Service' }]
  let id = 0
  const result = createMaintenancePlanCycle(workspace, {
    title: 'Pool filter inspection',
    systemId: 'system-pool',
    assetId: 'asset-filter',
    preferredVendorId: 'vendor-pool',
    responsibleMember: 'Larry',
    nextDueDate: '2026-08-31',
    recurrence: { interval: 3, unit: 'months' },
    expectedCost: '185.50',
    priority: 'high',
    instructions: 'Inspect and clean the filter.',
    calendarSyncEnabled: true,
  }, { now: '2026-08-26T12:00:00.000Z', createId: () => String(++id) })
  return { ...result, createId: () => String(++id) }
}

test('calendar-safe recurrence clamps month ends and leap years', () => {
  assert.equal(addMaintenanceRecurrence('2026-01-31', { interval: 1, unit: 'months' }), '2026-02-28')
  assert.equal(addMaintenanceRecurrence('2024-02-29', { interval: 1, unit: 'years' }), '2025-02-28')
  assert.equal(addMaintenanceRecurrence('2026-08-31', { interval: 3, unit: 'months' }), '2026-11-30')
})

test('creating a plan generates a normalized event and work order with shared relationships', () => {
  const { workspace, plan, event, workOrder } = fixture()
  assert.equal(plan.currentEventId, event.id)
  assert.equal(plan.currentWorkOrderId, workOrder.id)
  assert.equal(event.workOrderId, workOrder.id)
  assert.equal(workOrder.maintenancePlanId, plan.id)
  assert.equal(workOrder.assetId, 'asset-filter')
  assert.equal(workOrder.expectedCost, 185.5)
  assert.deepEqual(validateEstateWorkspace(workspace), [])
  assert.equal(estateWorkspaceSummary(workspace, { today: '2026-08-26' }).upcomingMaintenance, 1)
})

test('maintenance follows the controlled lifecycle and generates the next service only after cost is recorded', () => {
  let { workspace, event, createId } = fixture()
  for (const status of ['scheduled', 'in_progress', 'completed']) {
    const result = transitionMaintenanceEvent(workspace, { eventId: event.id, status }, { now: '2026-08-27T12:00:00.000Z', createId })
    workspace = result.workspace
    event = result.event
    assert.equal(result.generated, null)
  }
  assert.throws(() => transitionMaintenanceEvent(workspace, { eventId: event.id, status: 'cost_recorded' }, { createId }), /actual cost/)
  const costed = transitionMaintenanceEvent(workspace, { eventId: event.id, status: 'cost_recorded', actualCost: 200 }, { now: '2026-08-28T12:00:00.000Z', createId })
  assert.equal(costed.event.actualCost, 200)
  assert.equal(costed.generated.event.scheduledFor, '2026-11-30')
  assert.equal(costed.generated.event.occurrenceNumber, 2)
  assert.equal(costed.workspace.maintenancePlans[0].completedCycleCount, 1)
  assert.equal(costed.workspace.maintenanceEvents.length, 2)
  assert.deepEqual(validateEstateWorkspace(costed.workspace), [])
})

test('maintenance cannot skip lifecycle states', () => {
  const { workspace, event, createId } = fixture()
  assert.throws(() => transitionMaintenanceEvent(workspace, { eventId: event.id, status: 'completed' }, { createId }), /must move from due to scheduled/)
})

test('maintenance projects into the existing Family Calendar contract', () => {
  const { event, plan, workOrder } = fixture()
  assert.deepEqual(maintenanceCalendarEvent({ event, plan, workOrder, propertyName: 'Malbec Estate' }), {
    sourceId: `estate-maintenance-${event.id}`,
    title: 'Malbec Estate · Pool filter inspection',
    date: '2026-08-31',
    allDay: true,
    pillar: 'household',
    owner: 'Larry',
    participants: ['Larry'],
    priority: true,
  })
})

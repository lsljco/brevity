import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateWorkspace, estateWorkspaceSummary, validateEstateWorkspace } from './estateModel.js'

test('creates a normalized multi-property-capable Estate workspace', () => {
  const workspace = createEstateWorkspace({ householdId: 'family-1', propertyId: 'property-1', propertyName: 'Home' })
  assert.equal(workspace.property.householdId, 'family-1')
  assert.equal(workspace.property.id, 'property-1')
  assert.deepEqual(validateEstateWorkspace(workspace), [])
})

test('rejects duplicate entity ids and cross-property records', () => {
  const workspace = createEstateWorkspace({ propertyId: 'property-1' })
  workspace.systems = [{ id: 'duplicate', propertyId: 'property-1' }]
  workspace.assets = [{ id: 'duplicate', propertyId: 'property-2' }]
  const errors = validateEstateWorkspace(workspace)
  assert.ok(errors.some(error => error.includes('Duplicate Estate id')))
  assert.ok(errors.some(error => error.includes('different property')))
})

test('summarizes actionable work instead of raw record volume', () => {
  const workspace = createEstateWorkspace()
  workspace.workOrders = [
    { id: 'wo-1', propertyId: workspace.propertyId, status: 'due', dueDate: '2020-01-01' },
    { id: 'wo-2', propertyId: workspace.propertyId, status: 'completed' },
  ]
  workspace.projects = [{ id: 'project-1', propertyId: workspace.propertyId, status: 'in_progress' }]
  const summary = estateWorkspaceSummary(workspace)
  assert.equal(summary.openWorkOrders, 1)
  assert.equal(summary.overdueMaintenance, 1)
  assert.equal(summary.activeProjects, 1)
})

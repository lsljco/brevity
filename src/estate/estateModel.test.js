import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EstateValidationError,
  estateFingerprint,
  legacyEstateEntityId,
  normalizeEstateEntity,
  validateEstateEntity,
} from './estateModel.js'

test('Estate fingerprints and legacy ids are deterministic across key order', () => {
  const left = { id: 7, title: 'HVAC Service', cat: 'HVAC' }
  const right = { cat: 'HVAC', title: 'HVAC Service', id: 7 }
  assert.equal(estateFingerprint(left), estateFingerprint(right))
  assert.equal(
    legacyEstateEntityId('workOrder', 'malbecHOS_maintenance_maintenance', 7, left),
    legacyEstateEntityId('workOrder', 'malbecHOS_maintenance_maintenance', 7, right),
  )
})

test('legacy ids reconcile changed copies while missing ids use content fingerprints', () => {
  const original = { id: 7, title: 'HVAC service', stage: 'Scheduled' }
  const changed = { id: 7, title: 'HVAC service', stage: 'Completed' }
  assert.equal(
    legacyEstateEntityId('workOrder', 'malbecHOS_maintenance', 7, original),
    legacyEstateEntityId('workOrder', 'malbecHOS_maintenance', 7, changed),
  )
  assert.notEqual(
    legacyEstateEntityId('workOrder', 'malbecHOS_maintenance', null, original),
    legacyEstateEntityId('workOrder', 'malbecHOS_maintenance', null, changed),
  )
})

test('Estate entities receive version, household scope, actor and source metadata', () => {
  const entity = normalizeEstateEntity('propertySystem', {
    id: 'property-system-hvac',
    propertyId: 'property-malbec-estate',
    name: 'HVAC',
    source: { system: 'malbec-estate-household-os', legacyId: 2 },
  }, { householdId: 'household-1', actor: 'Larry', now: '2026-08-23T10:00:00.000Z' })
  assert.equal(entity.version, 1)
  assert.equal(entity.householdId, 'household-1')
  assert.equal(entity.createdBy, 'Larry')
  assert.equal(entity.sourceMetadata.legacyId, '2')
  assert.equal(entity.source, undefined)
})

test('Estate validation rejects missing relations and invalid maintenance frequency', () => {
  assert.throws(() => normalizeEstateEntity('maintenancePlan', {
    id: 'plan-1', propertyId: 'property-1', title: 'Filter', frequency: { interval: 0, unit: 'month' },
  }, { householdId: 'household-1' }), EstateValidationError)
  const errors = validateEstateEntity('asset', { id: 'asset-1', householdId: 'h', name: 'Pump', version: 1 })
  assert.ok(errors.some(error => error.includes('propertyId')))
  assert.ok(errors.some(error => error.includes('propertySystemId')))
  const dateErrors = validateEstateEntity('workOrder', {
    id: 'work-order-1', householdId: 'h', propertyId: 'property-1', title: 'Inspect', scheduledDate: '2026-99-99', version: 1,
  })
  assert.ok(dateErrors.some(error => error.includes('scheduledDate')))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileMalbecEstateExports, transformMalbecEstateExport } from './malbecTransform.js'

const source = {
  version: 'MalbecEstateHOS',
  exportedAt: '2026-08-23T11:00:00.000Z',
  sourceDeviceId: 'ipad-pro',
  data: {
    malbecHOS_maintenance_maintenance: JSON.stringify([
      { id: 1, title: 'Master Bathroom Faucet', desc: 'Dripping', cat: 'Plumbing', owner: 'Larry', stage: 'In Progress', scheduledDate: '2026-08-24', updated: '2026-08-22', updatedBy: 'Larry' },
      { id: 2, title: 'Downstairs HVAC Service', cat: 'HVAC', owner: 'Larry', stage: 'Completed', updated: '2026-08-20' },
    ]),
    malbecHOS_maintenance_projects: [
      { id: 9, title: 'Basement Flooring', cat: 'Renovation', owner: 'Larry', status: 'Discussion', currentMilestone: 'Select vendor', milestones: ['Scope', 'Select vendor', 'Build'], doneCount: 1 },
    ],
    malbecHOS_spiritual_prayers: [{ id: 3, title: 'Household unity' }],
  },
}

test('Malbec transform creates normalized property, systems, work orders and project records', () => {
  const result = transformMalbecEstateExport(source, { householdId: 'lslj-family' })
  assert.deepEqual(result.manifest.counts, { property: 1, propertySystem: 3, workOrder: 2, propertyProject: 1 })
  assert.equal(result.records.workOrder[0].propertyId, 'property-malbec-estate')
  assert.ok(result.records.propertySystem.every(system => system.id.includes('property-malbec-estate')))
  assert.equal(result.records.workOrder[0].status, 'in_progress')
  assert.equal(result.records.workOrder[1].completedDate, '2026-08-20')
  assert.equal(result.records.propertyProject[0].status, 'decision_required')
  assert.equal(result.records.propertyProject[0].milestones[1].status, 'in_progress')
  assert.equal(result.records.workOrder[0].sourceMetadata.legacyPayload.title, 'Master Bathroom Faucet')
  assert.deepEqual(result.manifest.deferredKeys, ['malbecHOS_spiritual_prayers'])
  assert.equal(result.manifest.dryRunRequired, true)
})

test('Malbec transform is idempotent for the same export and reports invalid rows', () => {
  const invalid = structuredClone(source)
  invalid.data.malbecHOS_maintenance_maintenance = [{ id: 1, title: '' }, { id: 2, title: 'Gutters', cat: 'Exterior', stage: 'Scheduled' }]
  const first = transformMalbecEstateExport(invalid)
  const second = transformMalbecEstateExport(invalid)
  assert.equal(first.records.workOrder.length, 1)
  assert.equal(first.records.workOrder[0].id, second.records.workOrder[0].id)
  assert.ok(first.manifest.warnings.some(warning => warning.includes('lacked a title')))
})

test('Malbec transform quarantines invalid dates without dropping the source value', () => {
  const invalidDate = structuredClone(source)
  invalidDate.data.malbecHOS_maintenance_maintenance = [{
    id: 42,
    title: 'Pool inspection',
    cat: 'Pool & Wellness',
    stage: 'Completed',
    scheduledDate: 'next Tuesday',
    updated: 'last week',
  }]
  const result = transformMalbecEstateExport(invalidDate)
  const record = result.records.workOrder[0]
  assert.equal(record.scheduledDate, undefined)
  assert.equal(record.completedDate, undefined)
  assert.equal(record.sourceMetadata.legacyPayload.scheduledDate, 'next Tuesday')
  assert.ok(result.manifest.warnings.some(warning => warning.includes('non-ISO scheduledDate')))
  assert.ok(result.manifest.warnings.some(warning => warning.includes('non-ISO completedDate')))
})

test('browser reconciliation reports changed copies instead of choosing a winner', () => {
  const changed = structuredClone(source)
  changed.sourceDeviceId = 'family-mac'
  changed.exportedAt = '2026-08-24T12:00:00.000Z'
  const rows = JSON.parse(changed.data.malbecHOS_maintenance_maintenance)
  rows[0].stage = 'Completed'
  changed.data.malbecHOS_maintenance_maintenance = JSON.stringify(rows)
  const result = reconcileMalbecEstateExports([source, changed], { extractedAt: '2026-08-24T13:00:00.000Z' })
  assert.equal(result.manifest.sourceDevices.length, 2)
  assert.equal(result.manifest.conflictCount, 1)
  assert.equal(result.conflicts[0].legacyId, '1')
  assert.deepEqual(result.conflicts[0].copies.map(copy => copy.sourceDeviceId).sort(), ['family-mac', 'ipad-pro'])
  assert.equal(result.records.workOrder.length, 1)
  assert.equal(result.records.workOrder[0].sourceMetadata.legacyId, '2')
})

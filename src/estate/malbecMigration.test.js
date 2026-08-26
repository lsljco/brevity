import assert from 'node:assert/strict'
import test from 'node:test'
import { transformMalbecBackup } from './malbecMigration.js'

const backup = {
  records: {
    malbecHOS_maintenance_maintenance: [
      { id: 1, title: 'Downstairs HVAC Service', cat: 'HVAC', stage: 'Scheduled', owner: 'Larry', scheduledDate: '2026-09-01' },
      { id: 2, title: 'Gutter Cleaning', cat: 'Exterior', stage: 'Completed' },
    ],
    malbecHOS_maintenance_projects: JSON.stringify([
      { id: 'p1', title: 'Basement Flooring', cat: 'Interior', status: 'In Progress', milestones: ['Select contractor'] },
    ]),
    malbecHOS_supplies_inv: [{ id: 1, name: 'Filters' }],
  },
}

test('transforms Malbec maintenance and projects without mutating the source backup', () => {
  const original = structuredClone(backup)
  const result = transformMalbecBackup(backup, { now: '2026-08-26T00:00:00.000Z' })
  assert.deepEqual(backup, original)
  assert.equal(result.workspace.workOrders.length, 2)
  assert.equal(result.workspace.projects.length, 1)
  assert.equal(result.workspace.workOrders[0].status, 'scheduled')
  assert.equal(result.workspace.workOrders[0].legacySource.legacyId, '1')
  assert.ok(result.report.deferredKeys.includes('supplies_inv'))
  assert.equal(result.report.destructiveSourceChanges, false)
})

test('produces deterministic ids so repeated imports can reconcile', () => {
  const first = transformMalbecBackup(backup, { now: '2026-08-26T00:00:00.000Z' })
  const second = transformMalbecBackup(backup, { now: '2026-08-27T00:00:00.000Z' })
  assert.equal(first.workspace.workOrders[0].id, second.workspace.workOrders[0].id)
  assert.equal(first.workspace.projects[0].id, second.workspace.projects[0].id)
})

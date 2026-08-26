import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeSourceInspection, transformMalbecBackup } from './malbecMigration.js'

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

test('retains export reconciliation metadata and pending file manifests', () => {
  const sourceInspection = {
    sourceFileName: 'malbec-2026-08-26.json',
    sourceChecksum: 'source-hash',
    sourceBytes: 15000000,
    sourceRecordCount: 12,
    importableRecordCount: 3,
    preparedChecksum: 'not-the-payload-checksum',
    keyCount: 60,
    fileCount: 1,
    embeddedFileBytes: 9000,
    files: [{ id: 'legacy-file-1', path: 'maintenance[0].photo', status: 'pending-document-import' }],
    blockingIssues: [],
  }
  const result = transformMalbecBackup(backup, { now: '2026-08-26T00:00:00.000Z', sourceInspection })
  assert.equal(result.workspace.migration.sourceChecksum, 'source-hash')
  assert.equal(result.workspace.migration.pendingFiles[0].id, 'legacy-file-1')
  assert.equal(result.report.sourceInspection.keyCount, 60)
  assert.equal(result.report.validation.transformedRecordCount, 3)
  assert.equal(result.report.validation.recordCountMatches, true)
})

test('sanitizes client-supplied file manifests before durable storage', () => {
  const result = sanitizeSourceInspection({
    sourceFileName: `malbec\u0000${'x'.repeat(300)}.json`,
    files: [{ id: 'file-1', path: 'records.photo', mimeType: 'image/png', byteEstimate: -10, status: 'complete' }, { id: '', path: '' }],
    blockingIssues: ['Review this record.'],
    sourceExports: [{ sourceFileName: 'device.json', sourceChecksum: 'hash-1', sourceRecordCount: 4 }],
    comparison: { sourceCount: 1, propertyRecordsAgree: true },
  })
  assert.ok(!result.sourceFileName.includes('\u0000'))
  assert.equal(result.sourceFileName.length, 240)
  assert.equal(result.files.length, 1)
  assert.equal(result.files[0].byteEstimate, 0)
  assert.equal(result.files[0].status, 'pending-document-import')
  assert.equal(result.sourceExports[0].sourceChecksum, 'hash-1')
  assert.equal(result.comparison.propertyRecordsAgree, true)
})

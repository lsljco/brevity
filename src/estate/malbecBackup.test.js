import assert from 'node:assert/strict'
import test from 'node:test'
import { compareMalbecExports, prepareMalbecBackup, reconciliationInspection } from './malbecBackup.js'

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'

test('catalogues embedded files without modifying the source backup', () => {
  const backup = { exportedAt: '2026-08-26T12:00:00.000Z', appVersion: 'MalbecEstateHOS', data: {
    malbecHOS_maintenance_maintenance: JSON.stringify([{ id: 1, title: 'Pool pump', photos: [tinyPng] }]),
    malbecHOS_maintenance_projects: JSON.stringify([{ id: 'p1', title: 'Terrace', files: [{ name: 'plan.png', data: tinyPng }] }]),
  } }
  const original = structuredClone(backup)
  const result = prepareMalbecBackup(backup, { sourceFileName: 'malbec.json', sourceBytes: 1200 })

  assert.deepEqual(backup, original)
  assert.equal(result.inspection.fileCount, 2)
  assert.equal(result.inspection.sourceFileName, 'malbec.json')
  assert.equal(result.inspection.sourceExportedAt, '2026-08-26T12:00:00.000Z')
  assert.equal(result.inspection.sourceAppVersion, 'MalbecEstateHOS')
  assert.ok(result.inspection.preparedChecksum)
  assert.equal(result.prepared.records.malbecHOS_maintenance_maintenance[0].photos[0].status, 'pending-document-import')
  assert.ok(!JSON.stringify(result.prepared).includes('iVBORw0KGgo'))
})

test('inventories every key and assigns migration dispositions', () => {
  const result = prepareMalbecBackup({ records: {
    malbecHOS_maintenance_maintenance: [{ id: 1 }],
    malbecHOS_supplies_inv: [{ id: 2 }, { id: 3 }],
    malbecHOS_spiritual_prayers: [{ id: 4 }],
  } })
  const dispositions = Object.fromEntries(result.inspection.keyInventory.map(item => [item.key, item.disposition]))
  assert.equal(result.inspection.sourceRecordCount, 4)
  assert.equal(dispositions.maintenance_maintenance, 'import-now')
  assert.equal(dispositions.supplies_inv, 'deferred')
  assert.equal(dispositions.spiritual_prayers, 'replace-or-retire')
})

test('duplicate legacy ids block initial import', () => {
  const result = prepareMalbecBackup({ malbecHOS_maintenance_maintenance: [{ id: 7 }, { id: 7 }] })
  assert.equal(result.inspection.duplicates[0].id, '7')
  assert.equal(result.inspection.blockingIssues.length, 1)
})

test('missing maintenance and project ids also block import', () => {
  const result = prepareMalbecBackup({ malbecHOS_maintenance_projects: [{ title: 'No source id' }] })
  assert.equal(result.inspection.missingLegacyIds[0].title, 'No source id')
  assert.match(result.inspection.blockingIssues[0], /legacy ID/)
})

test('a backup with no importable property records cannot create an empty workspace', () => {
  const result = prepareMalbecBackup({ malbecHOS_spiritual_prayers: [{ id: 1 }] })
  assert.equal(result.inspection.importableRecordCount, 0)
  assert.ok(result.inspection.blockingIssues.some(issue => /At least one maintenance or project/.test(issue)))
})

function deviceExport(fileName, exportedAt, maintenance, projects = [], extra = {}) {
  return prepareMalbecBackup({ exportedAt, appVersion: 'MalbecEstateHOS', data: {
    malbecHOS_maintenance_maintenance: JSON.stringify(maintenance),
    malbecHOS_maintenance_projects: JSON.stringify(projects),
    ...extra,
  } }, { sourceFileName: fileName })
}

test('matching device exports recommend the newest export and retain both sources', () => {
  const first = deviceExport('iphone.json', '2026-08-25T10:00:00Z', [{ id: 1, title: 'HVAC service' }])
  const second = deviceExport('desktop.json', '2026-08-26T10:00:00Z', [{ id: 1, title: 'HVAC service' }])
  const comparison = compareMalbecExports([first, second])
  assert.equal(comparison.propertyRecordsAgree, true)
  assert.equal(comparison.recommendedSourceIndex, 1)
  const inspection = reconciliationInspection([first, second], comparison)
  assert.equal(inspection.sourceFileName, 'desktop.json')
  assert.equal(inspection.sourceExports.length, 2)
  assert.equal(inspection.blockingIssues.length, 0)
})

test('records missing from one device block initial import', () => {
  const first = deviceExport('iphone.json', '2026-08-25T10:00:00Z', [{ id: 1, title: 'HVAC service' }, { id: 2, title: 'Pool service' }])
  const second = deviceExport('desktop.json', '2026-08-26T10:00:00Z', [{ id: 1, title: 'HVAC service' }])
  const comparison = compareMalbecExports([first, second])
  assert.equal(comparison.propertyConflicts[0].type, 'missing-record')
  assert.equal(comparison.recommendedSourceIndex, null)
  assert.ok(comparison.blockingIssues.some(issue => issue.includes('record 2')))
})

test('different versions of one legacy record block initial import', () => {
  const first = deviceExport('iphone.json', '2026-08-25T10:00:00Z', [{ id: 1, title: 'HVAC service', stage: 'Scheduled' }])
  const second = deviceExport('desktop.json', '2026-08-26T10:00:00Z', [{ id: 1, title: 'HVAC service', stage: 'Completed' }])
  const comparison = compareMalbecExports([first, second])
  assert.equal(comparison.propertyConflicts[0].type, 'divergent-record')
  assert.equal(comparison.propertyRecordsAgree, false)
})

test('differences in deferred domains are reported but do not block the property import', () => {
  const first = deviceExport('iphone.json', '2026-08-25T10:00:00Z', [{ id: 1 }], [], { malbecHOS_calendar_evs: JSON.stringify([{ id: 'a' }]) })
  const second = deviceExport('desktop.json', '2026-08-26T10:00:00Z', [{ id: 1 }], [], { malbecHOS_calendar_evs: JSON.stringify([{ id: 'b' }]) })
  const comparison = compareMalbecExports([first, second])
  assert.equal(comparison.deferredDifferences[0].key, 'calendar_evs')
  assert.equal(comparison.blockingIssues.length, 0)
  assert.equal(comparison.recommendedSourceIndex, 1)
})

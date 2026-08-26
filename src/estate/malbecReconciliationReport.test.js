import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMalbecReconciliationReport, reconciliationReportDownload } from './malbecReconciliationReport.js'

const comparison = {
  sources: [
    { sourceFileName: 'iphone.json', sourceChecksum: 'source-a', importableRecordCount: 2 },
    { sourceFileName: 'desktop.json', sourceChecksum: 'source-b', importableRecordCount: 2 },
  ],
  propertyRecordsAgree: true,
  propertyConflicts: [],
  deferredDifferences: [{ key: 'calendar_evs', type: 'divergent-key', disposition: 'deferred' }],
  blockingIssues: [],
}
const inspection = {
  keyInventory: [{ key: 'maintenance_maintenance', count: 2, disposition: 'import-now' }],
  files: [{ id: 'file-1', path: 'photo', mimeType: 'image/png', byteEstimate: 20, sourceChecksum: 'file-a', status: 'pending-document-import' }],
}
const preview = {
  dryRun: true,
  workspace: { propertyId: 'property-malbec-estate', property: { name: 'Malbec Estate' } },
  report: {
    counts: { systems: 1, workOrders: 1, projects: 1 },
    warnings: ['Calendar remains deferred.'],
    sourceInspection: { blockingIssues: [] },
    validation: { preparedChecksumVerified: true, inspectedImportableRecordCount: 2, transformedRecordCount: 2, recordCountMatches: true, readyForImport: true },
  },
}

test('builds a complete ready-for-import report from a server dry run', () => {
  const report = buildMalbecReconciliationReport({ preview, comparison, inspection, selectedIndex: 1, generatedAt: '2026-08-26T17:00:00.000Z' })
  assert.equal(report.result, 'ready-for-initial-import')
  assert.equal(report.selectedSource.sourceFileName, 'desktop.json')
  assert.equal(report.validation.recordCountMatches, true)
  assert.equal(report.comparison.deferredDifferences[0].key, 'calendar_evs')
  assert.equal(report.pendingFiles[0].status, 'pending-document-import')
  assert.equal(report.safeguards.sourceModified, false)
  const download = reconciliationReportDownload(report)
  assert.match(download.fileName, /^2026-08-26-malbec-estate-reconciliation-/)
  assert.equal(JSON.parse(download.contents).reportId, report.reportId)
})

test('marks the report blocked when comparison or server validation has an exception', () => {
  const report = buildMalbecReconciliationReport({
    preview: { ...preview, report: { ...preview.report, validation: { ...preview.report.validation, readyForImport: false, recordCountMatches: false }, sourceInspection: { blockingIssues: ['Counts differ.'] } } },
    comparison: { ...comparison, propertyRecordsAgree: false, blockingIssues: ['Property records differ.'] },
    inspection,
    selectedIndex: 0,
  })
  assert.equal(report.result, 'blocked')
  assert.equal(report.validation.readyForImport, false)
  assert.deepEqual(report.comparison.blockingIssues, ['Property records differ.', 'Counts differ.'])
})

test('requires a completed server dry run', () => {
  assert.throws(() => buildMalbecReconciliationReport({ preview: null, comparison, inspection, selectedIndex: 0 }), /server dry run/i)
})

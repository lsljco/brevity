import { MALBEC_PROPERTY_ID } from './estateModel.js'
import { MALBEC_SOURCE_SYSTEM } from './malbecMigration.js'

function checksum(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

export function buildMalbecReconciliationReport({
  preview,
  comparison,
  inspection,
  selectedIndex,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!preview?.dryRun || !preview.report || !comparison || !inspection) {
    throw new Error('A completed server dry run is required to create the reconciliation report.')
  }
  const selectedSource = comparison.sources?.[selectedIndex]
  if (!selectedSource) throw new Error('The selected Malbec source export is unavailable.')
  const blockers = unique([
    ...(comparison.blockingIssues || []),
    ...(preview.report.sourceInspection?.blockingIssues || []),
  ])
  const validation = preview.report.validation || {}
  const readyForImport = blockers.length === 0 && validation.readyForImport === true
  const reportId = `malbec-reconciliation-${checksum(JSON.stringify({
    sources: (comparison.sources || []).map(source => source.sourceChecksum),
    selected: selectedSource.sourceChecksum,
    counts: preview.report.counts,
  }))}`

  return {
    schemaVersion: 1,
    reportId,
    generatedAt,
    sourceSystem: MALBEC_SOURCE_SYSTEM,
    targetSystem: 'brevity',
    propertyId: preview.workspace?.propertyId || MALBEC_PROPERTY_ID,
    propertyName: preview.workspace?.property?.name || 'Malbec Estate',
    result: readyForImport ? 'ready-for-initial-import' : 'blocked',
    selectedSource,
    sourceExports: comparison.sources || [],
    comparison: {
      propertyRecordsAgree: comparison.propertyRecordsAgree,
      propertyConflicts: comparison.propertyConflicts || [],
      deferredDifferences: comparison.deferredDifferences || [],
      blockingIssues: blockers,
    },
    validation: {
      serverDryRunCompleted: true,
      preparedChecksumVerified: validation.preparedChecksumVerified === true,
      inspectedImportableRecordCount: Number(validation.inspectedImportableRecordCount || 0),
      excludedSeedCount: Number(validation.excludedSeedCount || 0),
      expectedTransformedRecordCount: Number(validation.expectedTransformedRecordCount || 0),
      transformedRecordCount: Number(validation.transformedRecordCount || 0),
      recordCountMatches: validation.recordCountMatches === true,
      readyForImport,
      transformedCounts: preview.report.counts,
    },
    inventory: inspection.keyInventory || [],
    seedReview: preview.report.seedReview || { candidateCount: 0, unresolvedCount: 0, excludedCount: 0, importedCount: 0, resolutions: [] },
    pendingFiles: (inspection.files || []).map(file => ({
      id: file.id,
      path: file.path,
      mimeType: file.mimeType,
      byteEstimate: file.byteEstimate,
      sourceChecksum: file.sourceChecksum,
      status: file.status,
    })),
    warnings: preview.report.warnings || [],
    safeguards: {
      sourceModified: false,
      estateModifiedByDryRun: false,
      embeddedFileBytesUploaded: false,
      legacyInfrastructureChanged: false,
    },
  }
}

export function reconciliationReportDownload(report) {
  if (!report?.reportId) throw new Error('A valid reconciliation report is required.')
  const date = String(report.generatedAt || '').slice(0, 10) || 'undated'
  return {
    fileName: `${date}-malbec-estate-reconciliation-${report.reportId.split('-').at(-1)}.json`,
    contents: `${JSON.stringify(report, null, 2)}\n`,
  }
}

export function downloadReconciliationReport(report) {
  const download = reconciliationReportDownload(report)
  const url = URL.createObjectURL(new Blob([download.contents], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = download.fileName
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return download.fileName
}

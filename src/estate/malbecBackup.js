import { MALBEC_SOURCE_SYSTEM } from './malbecMigration.js'

const IMPORT_KEYS = new Set(['maintenance_maintenance', 'maintenance_projects'])
const DEFERRED_KEYS = new Set(['supplies_inv', 'supplies_purch', 'calendar_evs'])
const PROPERTY_HINTS = ['maintenance_', 'supplies_', 'calendar_', 'household_']
const DATA_URL = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/s

function checksum(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizedKey(key) {
  return String(key || '').replace(/^malbecHOS_/, '')
}

function parseStoredValue(value) {
  if (typeof value !== 'string' || DATA_URL.test(value)) return value
  try { return JSON.parse(value) } catch { return value }
}

function sourceRecords(backup) {
  const records = backup?.records && typeof backup.records === 'object'
    ? backup.records
    : backup?.data && typeof backup.data === 'object'
      ? backup.data
      : backup
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('The selected file does not contain a Malbec record collection.')
  return Object.fromEntries(Object.entries(records).map(([key, value]) => [normalizedKey(key), parseStoredValue(value)]))
}

function recordCount(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return 1
  return value == null || value === '' ? 0 : 1
}

function duplicateIds(value) {
  if (!Array.isArray(value)) return []
  const counts = new Map()
  value.forEach((record, index) => {
    const id = String(record?.id ?? `missing-id-${index}`)
    counts.set(id, (counts.get(id) || 0) + 1)
  })
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }))
}

function missingIds(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((record, index) => record?.id == null || String(record.id).trim() === '' ? [{ index, title: String(record?.title || record?.name || 'Untitled record') }] : [])
}

function stripFiles(value, path, files) {
  if (typeof value === 'string') {
    const match = value.match(DATA_URL)
    if (!match) return value
    const id = `legacy-file-${checksum(`${path}:${match[2].slice(0, 256)}:${match[2].length}`)}`
    const mimeType = match[1] || 'application/octet-stream'
    const byteEstimate = Math.floor(match[2].replace(/=+$/, '').length * 3 / 4)
    files.push({ id, path, mimeType, byteEstimate, sourceChecksum: checksum(match[2]), status: 'pending-document-import' })
    return { legacyFileRef: id, status: 'pending-document-import' }
  }
  if (Array.isArray(value)) return value.map((item, index) => stripFiles(item, `${path}[${index}]`, files))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripFiles(item, `${path}.${key}`, files)]))
  }
  return value
}

export function prepareMalbecBackup(backup, { sourceFileName = 'malbec-backup.json', sourceBytes = 0 } = {}) {
  const records = sourceRecords(backup)
  const files = []
  const preparedRecords = Object.fromEntries(Object.entries(records).map(([key, value]) => [
    `malbecHOS_${key}`,
    stripFiles(value, `malbecHOS_${key}`, files),
  ]))
  const keys = Object.keys(records).sort()
  const keyInventory = keys.map(key => ({
    key,
    count: recordCount(records[key]),
    disposition: IMPORT_KEYS.has(key) ? 'import-now' : DEFERRED_KEYS.has(key) ? 'deferred' : PROPERTY_HINTS.some(prefix => key.startsWith(prefix)) ? 'manual-review' : 'replace-or-retire',
  }))
  const duplicates = [...IMPORT_KEYS].flatMap(key => duplicateIds(records[key]).map(duplicate => ({ key, ...duplicate })))
  const missingLegacyIds = [...IMPORT_KEYS].flatMap(key => missingIds(records[key]).map(issue => ({ key, ...issue })))
  const sourceRecordCount = keyInventory.reduce((total, item) => total + item.count, 0)
  const importableRecordCount = [...IMPORT_KEYS].reduce((total, key) => total + recordCount(records[key]), 0)
  const prepared = {
    format: 'brevity-malbec-structured-export',
    schemaVersion: 1,
    sourceSystem: MALBEC_SOURCE_SYSTEM,
    sourceFileName,
    sourceExportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
    sourceAppVersion: typeof backup.appVersion === 'string' ? backup.appVersion : null,
    extractedAt: new Date().toISOString(),
    records: preparedRecords,
  }
  const preparedBytes = new TextEncoder().encode(JSON.stringify(prepared)).length
  const warnings = []
  if (!keys.length) warnings.push('No Malbec storage keys were found.')
  if (![...IMPORT_KEYS].some(key => keys.includes(key))) warnings.push('No maintenance or project records were found for the initial Estate import.')
  if (files.length) warnings.push(`${files.length} embedded file${files.length === 1 ? '' : 's'} were catalogued and removed from the structured upload; their bytes remain in the untouched source backup.`)
  if (duplicates.length) warnings.push(`${duplicates.length} duplicate legacy ID group${duplicates.length === 1 ? '' : 's'} require reconciliation before commit.`)
  if (missingLegacyIds.length) warnings.push(`${missingLegacyIds.length} maintenance or project record${missingLegacyIds.length === 1 ? '' : 's'} have no legacy ID.`)

  return {
    prepared,
    inspection: {
      sourceSystem: MALBEC_SOURCE_SYSTEM,
      sourceFileName,
      sourceExportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
      sourceAppVersion: typeof backup.appVersion === 'string' ? backup.appVersion : null,
      sourceBytes,
      sourceChecksum: checksum(JSON.stringify(backup)),
      preparedBytes,
      keyCount: keys.length,
      sourceRecordCount,
      importableRecordCount,
      keyInventory,
      files,
      fileCount: files.length,
      embeddedFileBytes: files.reduce((total, file) => total + file.byteEstimate, 0),
      duplicates,
      missingLegacyIds,
      warnings,
      blockingIssues: [
        ...(importableRecordCount === 0 ? ['At least one maintenance or project record is required for the initial import.'] : []),
        ...(duplicates.length ? ['Duplicate maintenance or project IDs must be resolved before import.'] : []),
        ...(missingLegacyIds.length ? ['Every maintenance and project record must have a legacy ID before import.'] : []),
      ],
    },
  }
}

function preparedValue(source, key) {
  return source?.prepared?.records?.[`malbecHOS_${key}`]
}

function sourceLabel(source) {
  return source?.inspection?.sourceFileName || 'Unnamed export'
}

function propertyRecordConflicts(sources) {
  return [...IMPORT_KEYS].flatMap(key => {
    const recordsBySource = sources.map(source => Array.isArray(preparedValue(source, key)) ? preparedValue(source, key) : [])
    const ids = [...new Set(recordsBySource.flatMap(records => records.map(record => String(record?.id ?? ''))).filter(Boolean))]
    return ids.flatMap(legacyId => {
      const versions = recordsBySource.map(records => records.find(record => String(record?.id ?? '') === legacyId) || null)
      const present = versions.map((record, index) => record ? index : -1).filter(index => index >= 0)
      const missing = versions.map((record, index) => !record ? index : -1).filter(index => index >= 0)
      const fingerprints = [...new Set(versions.filter(Boolean).map(record => checksum(JSON.stringify(record))))]
      if (missing.length) return [{ type: 'missing-record', key, legacyId, presentIn: present.map(index => sourceLabel(sources[index])), missingFrom: missing.map(index => sourceLabel(sources[index])) }]
      if (fingerprints.length > 1) return [{ type: 'divergent-record', key, legacyId, presentIn: present.map(index => sourceLabel(sources[index])) }]
      return []
    })
  })
}

function otherKeyDifferences(sources) {
  const keys = [...new Set(sources.flatMap(source => source.inspection.keyInventory.map(item => item.key)))].filter(key => !IMPORT_KEYS.has(key)).sort()
  return keys.flatMap(key => {
    const versions = sources.map(source => preparedValue(source, key))
    const present = versions.map((value, index) => value !== undefined ? index : -1).filter(index => index >= 0)
    const missing = versions.map((value, index) => value === undefined ? index : -1).filter(index => index >= 0)
    const fingerprints = [...new Set(versions.filter(value => value !== undefined).map(value => checksum(JSON.stringify(value))))]
    if (!missing.length && fingerprints.length <= 1) return []
    const disposition = sources.flatMap(source => source.inspection.keyInventory).find(item => item.key === key)?.disposition || 'manual-review'
    return [{ key, disposition, type: missing.length ? 'missing-key' : 'divergent-key', presentIn: present.map(index => sourceLabel(sources[index])), missingFrom: missing.map(index => sourceLabel(sources[index])) }]
  })
}

export function compareMalbecExports(sources) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('At least one inspected Malbec export is required.')
  const propertyConflicts = sources.length > 1 ? propertyRecordConflicts(sources) : []
  const deferredDifferences = sources.length > 1 ? otherKeyDifferences(sources) : []
  const sourceBlockingIssues = sources.flatMap(source => source.inspection.blockingIssues.map(issue => `${sourceLabel(source)}: ${issue}`))
  const blockingIssues = [
    ...sourceBlockingIssues,
    ...propertyConflicts.map(conflict => conflict.type === 'missing-record'
      ? `${conflict.key} record ${conflict.legacyId} is missing from ${conflict.missingFrom.join(', ')}.`
      : `${conflict.key} record ${conflict.legacyId} differs between device exports.`),
  ]
  const recommendedSourceIndex = blockingIssues.length ? null : sources
    .map((source, index) => ({ index, time: Date.parse(source.inspection.sourceExportedAt || '') || 0 }))
    .sort((a, b) => b.time - a.time || b.index - a.index)[0].index
  return {
    sourceCount: sources.length,
    sources: sources.map((source, index) => ({
      index,
      sourceFileName: source.inspection.sourceFileName,
      sourceExportedAt: source.inspection.sourceExportedAt,
      sourceChecksum: source.inspection.sourceChecksum,
      sourceRecordCount: source.inspection.sourceRecordCount,
      importableRecordCount: source.inspection.importableRecordCount,
      fileCount: source.inspection.fileCount,
    })),
    propertyConflicts,
    deferredDifferences,
    blockingIssues,
    recommendedSourceIndex,
    propertyRecordsAgree: propertyConflicts.length === 0,
  }
}

export function reconciliationInspection(sources, comparison, selectedIndex = comparison?.recommendedSourceIndex) {
  const selected = sources?.[selectedIndex]
  if (!selected) throw new Error('Choose a valid source export for reconciliation.')
  return {
    ...selected.inspection,
    blockingIssues: [...new Set([...(selected.inspection.blockingIssues || []), ...(comparison.blockingIssues || [])])],
    sourceExports: comparison.sources,
    comparison: {
      sourceCount: comparison.sourceCount,
      propertyRecordsAgree: comparison.propertyRecordsAgree,
      propertyConflictCount: comparison.propertyConflicts.length,
      deferredDifferenceCount: comparison.deferredDifferences.length,
    },
  }
}

export function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

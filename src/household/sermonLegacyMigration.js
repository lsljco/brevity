export const APOSTOLIC_EXPORT_FORMAT = 'apostolic-sermon-device-export'
export const APOSTOLIC_RECORD_KEYS = Object.freeze([
  'apostolic_sermon_library_v1',
  'apostolic_lib_subfolders_v1',
  'counselee_profiles_v1',
  'ct-revelation-threads-v1',
  'ct_captured_micdrops_v1',
  'ct_generated_quotes_v1',
])

const clean = (value, length = 240) => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, length)
const parse = (raw, fallback) => { try { return JSON.parse(raw) } catch { return fallback } }
export const legacyRecordFingerprint = value => {
  let hash = 2166136261
  for (const character of JSON.stringify(value ?? null)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

export function inspectApostolicDeviceExport(value) {
  const issues = []
  if (!value || typeof value !== 'object') return { valid: false, issues: ['The rescue package must be a JSON object.'] }
  if (value.format !== APOSTOLIC_EXPORT_FORMAT || Number(value.schemaVersion) !== 1) issues.push('This is not an Apostolic Sermon Builder device rescue package.')
  const records = {}
  APOSTOLIC_RECORD_KEYS.forEach(key => {
    if (typeof value.records?.[key] === 'string') records[key] = value.records[key]
  })
  if (!Object.keys(records).length) issues.push('The rescue package contains no recognized Apostolic records.')
  const sermons = parse(records.apostolic_sermon_library_v1, [])
  const threads = parse(records['ct-revelation-threads-v1'], [])
  const profiles = parse(records.counselee_profiles_v1, {})
  if (!Array.isArray(sermons)) issues.push('The Apostolic sermon library is not a valid array.')
  if (!Array.isArray(threads)) issues.push('The revelation thread collection is not a valid array.')
  if (!profiles || Array.isArray(profiles) || typeof profiles !== 'object') issues.push('The counseling profile collection is not a valid object.')
  const normalizedSermons = Array.isArray(sermons) ? sermons.filter(record => record && typeof record === 'object').map((record, index) => ({
    legacyId: clean(record.id || `device-record-${index}`, 160),
    title: clean(record.sermon?.sermon_title || record.title || 'Untitled sermon', 240),
    savedAt: clean(record.savedAt, 60) || null,
    dateLabel: clean(record.dateStr, 80) || null,
    hasNotes: Boolean(record.notes),
    quoteCount: Array.isArray(record.quotes) ? record.quotes.length : 0,
    hasFacebookDraft: Boolean(record.facebook),
    infographicCount: Array.isArray(record.infographics) ? record.infographics.length : record.infographics ? 1 : 0,
    fingerprint: legacyRecordFingerprint(record),
    record,
  })) : []
  return {
    valid: issues.length === 0,
    issues,
    source: { deviceLabel: clean(value.deviceLabel, 120) || 'Unlabeled Apostolic device', exportedAt: clean(value.exportedAt, 60) || null, sourceOrigin: clean(value.sourceOrigin, 240) || null },
    records,
    sermons: normalizedSermons,
    counts: {
      sermons: normalizedSermons.length,
      folders: Object.keys(parse(records.apostolic_lib_subfolders_v1, {}) || {}).length,
      counselingProfiles: Object.keys(profiles || {}).length,
      revelationThreads: Array.isArray(threads) ? threads.length : 0,
      capturedMicDropGroups: Object.keys(parse(records.ct_captured_micdrops_v1, {}) || {}).length,
      generatedQuoteGroups: Object.keys(parse(records.ct_generated_quotes_v1, {}) || {}).length,
    },
  }
}

export function mergeApostolicSermonIndex(existing = [], incoming = [], sourceExportChecksum) {
  const next = existing.map(entry => ({ ...entry, sourceExportChecksums: [...(entry.sourceExportChecksums || [])] }))
  let imported = 0
  let duplicate = 0
  incoming.forEach(record => {
    const exact = next.find(entry => entry.fingerprint === record.fingerprint)
    if (exact) {
      if (!exact.sourceExportChecksums.includes(sourceExportChecksum)) exact.sourceExportChecksums.push(sourceExportChecksum)
      duplicate += 1
      return
    }
    const conflict = next.filter(entry => entry.legacyId === record.legacyId && entry.fingerprint !== record.fingerprint)
    const conflictGroup = conflict.length ? `apostolic-conflict-${legacyRecordFingerprint(record.legacyId)}` : null
    conflict.forEach(entry => { entry.conflictGroup = conflictGroup })
    next.push({
      id: `legacy-sermon-${record.fingerprint}`,
      legacyId: record.legacyId,
      fingerprint: record.fingerprint,
      title: record.title,
      savedAt: record.savedAt,
      dateLabel: record.dateLabel,
      hasNotes: record.hasNotes,
      quoteCount: record.quoteCount,
      hasFacebookDraft: record.hasFacebookDraft,
      infographicCount: record.infographicCount,
      conflictGroup,
      sourceExportChecksums: [sourceExportChecksum],
    })
    imported += 1
  })
  return { entries: next, imported, duplicate, conflicts: next.filter(entry => entry.conflictGroup).length }
}

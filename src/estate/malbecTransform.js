import {
  estateFingerprint,
  isEstateDateValue,
  legacyEstateEntityId,
  normalizeEstateEntity,
  slugifyEstateValue,
} from './estateModel.js'

export const MALBEC_PREFIX = 'malbecHOS_'
export const MALBEC_REPOSITORY = 'lsljco/malbec-estate-household-os'
export const MALBEC_PROPERTY_ID = 'property-malbec-estate'

const SYSTEM_MAP = new Map([
  ['plumbing', ['plumbing', 'Plumbing']],
  ['hvac', ['hvac', 'HVAC']],
  ['electrical', ['electrical', 'Electrical']],
  ['doors', ['exterior', 'Exterior']],
  ['exterior', ['exterior', 'Exterior']],
  ['safety', ['life-safety', 'Life Safety']],
  ['home improvement', ['general-improvements', 'General Improvements']],
  ['renovation', ['general-improvements', 'General Improvements']],
  ['construction', ['general-improvements', 'General Improvements']],
  ['general', ['general', 'General']],
])

const WORK_ORDER_STATUS = {
  Scheduled: 'scheduled',
  'In Progress': 'in_progress',
  'Needs Review': 'needs_review',
  Completed: 'completed',
}

const PROJECT_STATUS = {
  Planning: 'planning',
  'In Progress': 'in_progress',
  Discussion: 'decision_required',
  Completed: 'completed',
}

function valueFromExport(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

export function readMalbecExport(payload = {}) {
  const candidate = payload.data || payload.records || payload
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {}
  return Object.fromEntries(Object.entries(candidate)
    .filter(([key]) => key.startsWith(MALBEC_PREFIX))
    .map(([key, value]) => [key, valueFromExport(value)]))
}

function sourceMetadata({ storageKey, record, migrationId, extractedAt, sourceDeviceId }) {
  return {
    system: 'malbec-estate-household-os',
    repository: MALBEC_REPOSITORY,
    legacyStorageKey: storageKey,
    legacyId: record.id,
    legacyHash: estateFingerprint(record),
    legacyHashAlgorithm: 'fnv1a32',
    sourceDeviceId,
    extractedAt,
    migratedAt: extractedAt,
    migrationId,
    legacyPayload: record,
  }
}

function systemDefinition(category = '', propertyId = MALBEC_PROPERTY_ID) {
  const normalized = String(category || 'General').trim().toLowerCase()
  const [code, name] = SYSTEM_MAP.get(normalized) || [`legacy-${slugifyEstateValue(normalized, 'general')}`, String(category || 'General').trim() || 'General']
  return { id: `property-system-${slugifyEstateValue(propertyId)}-${code}`, code, name, legacyCategory: String(category || 'General') }
}

function validRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && String(value.title || '').trim()
}

function canonicalDate(value, field, record, warnings) {
  if (!value) return undefined
  const text = String(value).trim()
  if (isEstateDateValue(text)) return text
  warnings.push(`Maintenance record ${record.id ?? '(no id)'} has a non-ISO ${field}; the original value was retained only in legacy metadata.`)
  return undefined
}

export function transformMalbecEstateExport(payload, options = {}) {
  const exported = readMalbecExport(payload)
  const householdId = options.householdId || 'lslj-family'
  const propertyId = options.propertyId || MALBEC_PROPERTY_ID
  const extractedAt = options.extractedAt || payload.exportedAt || payload.timestamp || payload.exportDate || new Date().toISOString()
  const sourceDeviceId = options.sourceDeviceId || payload.sourceDeviceId || 'unidentified-browser'
  const migrationId = options.migrationId || `malbec-${slugifyEstateValue(sourceDeviceId)}-${String(extractedAt).slice(0, 10)}`
  const warnings = []
  const nowContext = { householdId, actor: 'migration', now: extractedAt }
  const maintenanceKey = `${MALBEC_PREFIX}maintenance_maintenance`
  const projectsKey = `${MALBEC_PREFIX}maintenance_projects`
  const maintenance = Array.isArray(exported[maintenanceKey]) ? exported[maintenanceKey] : []
  const projects = Array.isArray(exported[projectsKey]) ? exported[projectsKey] : []

  if (exported[maintenanceKey] != null && !Array.isArray(exported[maintenanceKey])) warnings.push(`${maintenanceKey} is not an array and was skipped.`)
  if (exported[projectsKey] != null && !Array.isArray(exported[projectsKey])) warnings.push(`${projectsKey} is not an array and was skipped.`)

  const invalidMaintenance = maintenance.filter(record => !validRecord(record))
  const invalidProjects = projects.filter(record => !validRecord(record))
  if (invalidMaintenance.length) warnings.push(`${invalidMaintenance.length} maintenance record(s) lacked a title and were skipped.`)
  if (invalidProjects.length) warnings.push(`${invalidProjects.length} project record(s) lacked a title and were skipped.`)

  const acceptedMaintenance = maintenance.filter(validRecord)
  const acceptedProjects = projects.filter(validRecord)
  const systemsById = new Map()
  ;[...acceptedMaintenance, ...acceptedProjects].forEach(record => {
    const system = systemDefinition(record.cat, propertyId)
    if (!systemsById.has(system.id)) systemsById.set(system.id, system)
  })

  const property = normalizeEstateEntity('property', {
    id: propertyId,
    name: options.propertyName || 'Malbec Estate',
    status: 'active',
    timeZone: options.timeZone || 'America/New_York',
    sourceMetadata: {
      system: 'malbec-estate-household-os',
      repository: MALBEC_REPOSITORY,
      legacyId: 'malbec-estate',
      extractedAt,
      migratedAt: extractedAt,
      migrationId,
      sourceDeviceId,
    },
  }, nowContext)

  const propertySystems = [...systemsById.values()].map(system => normalizeEstateEntity('propertySystem', {
    id: system.id,
    propertyId,
    name: system.name,
    code: system.code,
    status: 'active',
    sourceMetadata: {
      system: 'malbec-estate-household-os',
      repository: MALBEC_REPOSITORY,
      legacyStorageKey: `${maintenanceKey}|${projectsKey}`,
      legacyId: system.legacyCategory,
      extractedAt,
      migratedAt: extractedAt,
      migrationId,
      sourceDeviceId,
    },
  }, nowContext))

  const workOrders = acceptedMaintenance.map(record => {
    const system = systemDefinition(record.cat, propertyId)
    return normalizeEstateEntity('workOrder', {
      id: legacyEstateEntityId('workOrder', maintenanceKey, record.id, record),
      propertyId,
      propertySystemId: system.id,
      title: String(record.title).trim(),
      scope: String(record.desc || ''),
      workType: 'maintenance',
      status: WORK_ORDER_STATUS[record.stage] || 'needs_review',
      legacyStatus: String(record.stage || ''),
      scheduledDate: canonicalDate(record.scheduledDate, 'scheduledDate', record, warnings),
      assignedMemberNames: record.owner ? [String(record.owner)] : [],
      completedDate: record.stage === 'Completed' ? canonicalDate(record.updated, 'completedDate', record, warnings) : undefined,
      sourceUpdatedDate: canonicalDate(record.updated, 'updated date', record, warnings),
      sourceUpdatedBy: record.updatedBy || record.owner || '',
      sourceMetadata: sourceMetadata({ storageKey: maintenanceKey, record, migrationId, extractedAt, sourceDeviceId }),
    }, nowContext)
  })

  const propertyProjects = acceptedProjects.map(record => {
    const system = systemDefinition(record.cat, propertyId)
    const milestones = Array.isArray(record.milestones) ? record.milestones.map((title, index) => ({
      id: `milestone-${index + 1}-${slugifyEstateValue(title)}`,
      title: String(title),
      sequence: index + 1,
      status: index < Number(record.doneCount || 0) ? 'completed' : String(title) === String(record.currentMilestone || '') ? 'in_progress' : 'pending',
    })) : []
    return normalizeEstateEntity('propertyProject', {
      id: legacyEstateEntityId('propertyProject', projectsKey, record.id, record),
      propertyId,
      propertySystemId: system.id,
      title: String(record.title).trim(),
      scope: String(record.desc || ''),
      status: PROJECT_STATUS[record.status] || 'planning',
      legacyStatus: String(record.status || ''),
      responsibleMemberNames: record.owner ? [String(record.owner)] : [],
      currentMilestone: String(record.currentMilestone || ''),
      milestones,
      sourceUpdatedDate: record.updated || undefined,
      sourceUpdatedBy: record.updatedBy || record.owner || '',
      sourceMetadata: sourceMetadata({ storageKey: projectsKey, record, migrationId, extractedAt, sourceDeviceId }),
    }, nowContext)
  })

  const handledKeys = new Set([maintenanceKey, projectsKey])
  const deferredKeys = Object.keys(exported).filter(key => !handledKeys.has(key))
  if (deferredKeys.length) warnings.push(`${deferredKeys.length} non-Estate or deferred Malbec data key(s) were preserved in the source export but not transformed by this Estate increment.`)

  const records = { property: [property], propertySystem: propertySystems, workOrder: workOrders, propertyProject: propertyProjects }
  return {
    manifest: {
      migrationId,
      sourceSystem: 'malbec-estate-household-os',
      sourceRepository: MALBEC_REPOSITORY,
      sourceDeviceId,
      extractedAt,
      transformedAt: extractedAt,
      householdId,
      propertyId,
      dryRunRequired: true,
      sourceKeys: Object.keys(exported).sort(),
      deferredKeys: deferredKeys.sort(),
      counts: Object.fromEntries(Object.entries(records).map(([type, values]) => [type, values.length])),
      warnings,
    },
    records,
  }
}

export function reconcileMalbecEstateExports(exports, options = {}) {
  if (!Array.isArray(exports) || !exports.length) throw new Error('At least one Malbec browser export is required for reconciliation.')
  const transformed = exports.map((descriptor, index) => {
    const payload = descriptor?.payload || descriptor
    return transformMalbecEstateExport(payload, {
      ...options,
      sourceDeviceId: descriptor?.sourceDeviceId || payload?.sourceDeviceId || `unidentified-browser-${index + 1}`,
      extractedAt: descriptor?.extractedAt || payload?.exportedAt || payload?.timestamp || payload?.exportDate || options.extractedAt,
      migrationId: undefined,
    })
  })
  const groups = new Map()
  for (const result of transformed) {
    for (const [entityType, records] of Object.entries(result.records)) {
      for (const record of records) {
        const key = `${entityType}:${record.id}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({ entityType, record })
      }
    }
  }
  const records = {}
  const conflicts = []
  for (const candidates of groups.values()) {
    const { entityType } = candidates[0]
    const hashes = new Set(candidates.map(({ record }) => record.sourceMetadata?.legacyHash).filter(Boolean))
    if (hashes.size > 1) {
      const first = candidates[0].record
      conflicts.push({
        entityType,
        id: first.id,
        legacyStorageKey: first.sourceMetadata?.legacyStorageKey || '',
        legacyId: first.sourceMetadata?.legacyId || '',
        copies: candidates.map(({ record }) => ({
          sourceDeviceId: record.sourceMetadata?.sourceDeviceId || '',
          extractedAt: record.sourceMetadata?.extractedAt || '',
          legacyHash: record.sourceMetadata?.legacyHash || '',
          legacyPayload: record.sourceMetadata?.legacyPayload ?? null,
        })),
      })
      continue
    }
    const selected = candidates.map(({ record }) => record).sort((left, right) => String(right.sourceMetadata?.extractedAt || '').localeCompare(String(left.sourceMetadata?.extractedAt || '')))[0]
    if (!records[entityType]) records[entityType] = []
    records[entityType].push(selected)
  }
  for (const entityType of Object.keys(records)) records[entityType].sort((left, right) => left.id.localeCompare(right.id))
  conflicts.sort((left, right) => `${left.entityType}:${left.id}`.localeCompare(`${right.entityType}:${right.id}`))
  const sourceDevices = transformed.map(result => ({
    sourceDeviceId: result.manifest.sourceDeviceId,
    extractedAt: result.manifest.extractedAt,
    sourceKeys: result.manifest.sourceKeys,
    counts: result.manifest.counts,
  }))
  const deferredKeys = [...new Set(transformed.flatMap(result => result.manifest.deferredKeys))].sort()
  const migrationId = options.migrationId || `malbec-reconcile-${String(options.extractedAt || new Date().toISOString()).slice(0, 10)}`
  return {
    manifest: {
      migrationId,
      sourceSystem: 'malbec-estate-household-os',
      sourceRepository: MALBEC_REPOSITORY,
      householdId: options.householdId || 'lslj-family',
      propertyId: options.propertyId || MALBEC_PROPERTY_ID,
      sourceDevices,
      deferredKeys,
      dryRunRequired: true,
      acceptedCounts: Object.fromEntries(Object.entries(records).map(([type, values]) => [type, values.length])),
      conflictCount: conflicts.length,
      warnings: transformed.flatMap(result => result.manifest.warnings.map(warning => `${result.manifest.sourceDeviceId}: ${warning}`)),
    },
    records,
    conflicts,
  }
}

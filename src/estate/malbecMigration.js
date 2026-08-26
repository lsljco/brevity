import { createEstateWorkspace, MALBEC_PROPERTY_ID, validateEstateWorkspace } from './estateModel.js'

export const MALBEC_SOURCE_SYSTEM = 'malbec-estate-household-os'

const SYSTEM_ALIASES = Object.freeze({
  electrical: 'Electrical',
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  pool: 'Pool & Wellness',
  spa: 'Pool & Wellness',
  exterior: 'Exterior',
  landscape: 'Grounds',
  landscaping: 'Grounds',
  grounds: 'Grounds',
  safety: 'Safety & Security',
  security: 'Safety & Security',
  interior: 'Interior',
})

function valueFromBackup(backup, key) {
  const candidates = [
    backup?.records?.[`malbecHOS_${key}`],
    backup?.records?.[key],
    backup?.[`malbecHOS_${key}`],
    backup?.[key],
  ]
  const found = candidates.find(value => value !== undefined)
  if (typeof found !== 'string') return found
  try { return JSON.parse(found) } catch { return found }
}

function slug(value) {
  return String(value || 'record').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'record'
}

function checksum(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function legacyId(type, record, index) {
  const sourceId = record?.id ?? `${record?.title || record?.name || type}-${index}`
  return `${type}-${slug(sourceId)}-${checksum(`${type}:${sourceId}`)}`
}

function sourceMetadata(key, record, index) {
  return {
    system: MALBEC_SOURCE_SYSTEM,
    storageKey: `malbecHOS_${key}`,
    legacyId: String(record?.id ?? index),
    sourceIndex: index,
    sourceChecksum: checksum(JSON.stringify(record || null)),
  }
}

function systemName(category) {
  const normalized = String(category || '').toLowerCase().trim()
  return SYSTEM_ALIASES[normalized] || (normalized.includes('door') ? 'Exterior' : normalized.includes('roof') || normalized.includes('gutter') ? 'Exterior' : 'General')
}

function workOrderStatus(value) {
  const status = String(value || '').toLowerCase()
  if (status.includes('complete') || status === 'done') return 'completed'
  if (status.includes('progress')) return 'in_progress'
  if (status.includes('schedul')) return 'scheduled'
  if (status.includes('cancel')) return 'cancelled'
  return 'due'
}

function projectStatus(value) {
  const status = String(value || '').toLowerCase()
  if (status.includes('complete') || status === 'done') return 'completed'
  if (status.includes('progress') || status.includes('active')) return 'in_progress'
  if (status.includes('hold') || status.includes('defer')) return 'on_hold'
  if (status.includes('cancel')) return 'cancelled'
  return 'planned'
}

function safeText(value, length = 240) {
  return String(value || '').replace(/[\u0000-\u001f]/g, '').slice(0, length)
}

export function sanitizeSourceInspection(value) {
  if (!value || typeof value !== 'object') return null
  const files = Array.isArray(value.files) ? value.files.slice(0, 2000).map(file => ({
    id: safeText(file?.id, 120),
    path: safeText(file?.path, 500),
    mimeType: safeText(file?.mimeType, 120),
    byteEstimate: Math.max(0, Number(file?.byteEstimate || 0)),
    sourceChecksum: safeText(file?.sourceChecksum, 120),
    status: 'pending-document-import',
  })).filter(file => file.id && file.path) : []
  return {
    sourceFileName: safeText(value.sourceFileName, 240),
    sourceExportedAt: safeText(value.sourceExportedAt, 60),
    sourceAppVersion: safeText(value.sourceAppVersion, 120),
    sourceChecksum: safeText(value.sourceChecksum, 120),
    sourceBytes: Math.max(0, Number(value.sourceBytes || 0)),
    sourceRecordCount: Math.max(0, Number(value.sourceRecordCount || 0)),
    preparedBytes: Math.max(0, Number(value.preparedBytes || 0)),
    keyCount: Math.max(0, Number(value.keyCount || 0)),
    fileCount: files.length,
    embeddedFileBytes: files.reduce((total, file) => total + file.byteEstimate, 0),
    files,
    blockingIssues: Array.isArray(value.blockingIssues) ? value.blockingIssues.slice(0, 20).map(issue => safeText(issue, 500)).filter(Boolean) : [],
  }
}

export function transformMalbecBackup(backup, {
  householdId = 'lslj-family',
  propertyId = MALBEC_PROPERTY_ID,
  now = new Date().toISOString(),
  sourceInspection = null,
} = {}) {
  if (!backup || typeof backup !== 'object') throw new Error('A Malbec JSON backup is required.')
  sourceInspection = sanitizeSourceInspection(sourceInspection)
  const maintenance = valueFromBackup(backup, 'maintenance_maintenance')
  const projects = valueFromBackup(backup, 'maintenance_projects')
  const warnings = []
  if (!Array.isArray(maintenance)) warnings.push('No Malbec maintenance array was found; no work orders were transformed.')
  if (!Array.isArray(projects)) warnings.push('No Malbec project array was found; no projects were transformed.')

  const maintenanceRows = Array.isArray(maintenance) ? maintenance : []
  const projectRows = Array.isArray(projects) ? projects : []
  const categories = [...new Set([...maintenanceRows, ...projectRows].map(row => systemName(row.cat || row.category)))]
  const systems = categories.map(name => ({
    id: `system-${slug(name)}`,
    propertyId,
    name,
    category: name,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    legacySource: { system: MALBEC_SOURCE_SYSTEM, inferredFrom: 'maintenance and project categories' },
  }))
  const systemId = category => systems.find(system => system.name === systemName(category))?.id || null

  const workspace = createEstateWorkspace({ householdId, propertyId, propertyName: 'Malbec Estate', now })
  workspace.systems = systems
  workspace.workOrders = maintenanceRows.map((record, index) => ({
    id: legacyId('work-order', record, index),
    propertyId,
    systemId: systemId(record.cat || record.category),
    assetId: null,
    maintenancePlanId: null,
    title: String(record.title || 'Untitled maintenance item'),
    description: String(record.desc || record.description || ''),
    status: workOrderStatus(record.stage || record.status),
    priority: String(record.priority || 'medium').toLowerCase(),
    responsibleMember: record.owner || null,
    preferredVendorId: null,
    scheduledDate: record.scheduledDate || null,
    dueDate: record.dueDate || record.scheduledDate || null,
    expectedCost: null,
    actualCost: null,
    notes: '',
    createdAt: record.createdAt || now,
    updatedAt: record.updated || now,
    updatedBy: record.updatedBy || null,
    legacySource: sourceMetadata('maintenance_maintenance', record, index),
  }))
  workspace.projects = projectRows.map((record, index) => ({
    id: legacyId('property-project', record, index),
    propertyId,
    systemId: systemId(record.cat || record.category),
    assetIds: [],
    title: String(record.title || 'Untitled property project'),
    scope: String(record.desc || record.description || ''),
    status: projectStatus(record.status || record.stage),
    owner: record.owner || null,
    budget: null,
    actualSpend: null,
    currentMilestone: record.currentMilestone || null,
    milestones: Array.isArray(record.milestones) ? record.milestones : [],
    legacyDoneCount: Number(record.doneCount || 0),
    createdAt: record.createdAt || now,
    updatedAt: record.updated || now,
    updatedBy: record.updatedBy || null,
    legacySource: sourceMetadata('maintenance_projects', record, index),
  }))
  workspace.migration = sourceInspection ? {
    sourceSystem: MALBEC_SOURCE_SYSTEM,
    sourceFileName: sourceInspection.sourceFileName || null,
    sourceExportedAt: sourceInspection.sourceExportedAt || null,
    sourceAppVersion: sourceInspection.sourceAppVersion || null,
    sourceChecksum: sourceInspection.sourceChecksum || null,
    sourceBytes: Number(sourceInspection.sourceBytes || 0),
    sourceRecordCount: Number(sourceInspection.sourceRecordCount || 0),
    importedAt: now,
    pendingFiles: Array.isArray(sourceInspection.files) ? sourceInspection.files : [],
  } : null

  const recognizedKeys = ['maintenance_maintenance', 'maintenance_projects']
  const deferredKeys = ['supplies_inv', 'supplies_purch', 'calendar_evs']
    .filter(key => valueFromBackup(backup, key) !== undefined)
  if (deferredKeys.length) warnings.push(`Preserved but not imported in this increment: ${deferredKeys.join(', ')}.`)
  const validationErrors = validateEstateWorkspace(workspace)
  if (validationErrors.length) throw new Error(`Transformed Estate data is invalid: ${validationErrors.join(' ')}`)

  return {
    workspace,
    report: {
      sourceSystem: MALBEC_SOURCE_SYSTEM,
      mode: 'extract-transform',
      destructiveSourceChanges: false,
      recognizedKeys,
      deferredKeys,
      counts: {
        systems: workspace.systems.length,
        workOrders: workspace.workOrders.length,
        projects: workspace.projects.length,
      },
      warnings,
      sourceInspection: sourceInspection ? {
        sourceFileName: sourceInspection.sourceFileName || null,
        sourceExportedAt: sourceInspection.sourceExportedAt || null,
        sourceChecksum: sourceInspection.sourceChecksum || null,
        sourceRecordCount: Number(sourceInspection.sourceRecordCount || 0),
        fileCount: Number(sourceInspection.fileCount || 0),
        embeddedFileBytes: Number(sourceInspection.embeddedFileBytes || 0),
        keyCount: Number(sourceInspection.keyCount || 0),
        blockingIssues: Array.isArray(sourceInspection.blockingIssues) ? sourceInspection.blockingIssues : [],
      } : null,
    },
  }
}

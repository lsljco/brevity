import { normalizeProjectItem, PROJECT_STORAGE_KEY } from '../homehq/projectData.js'
import {
  estateFingerprint,
  isEstateDateValue,
  legacyEstateEntityId,
  normalizeEstateEntity,
  slugifyEstateValue,
} from './estateModel.js'
import { MALBEC_PROPERTY_ID } from './malbecTransform.js'

export const HOMEHQ_SOURCE_SYSTEM = 'brevity-homehq-localstorage'

const PROJECT_STATUS = { 'To Do': 'planning', 'In Progress': 'in_progress', Done: 'completed' }
const WORK_ORDER_STATUS = { 'To Do': 'due', 'In Progress': 'in_progress', Done: 'completed' }

function parsedValue(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

export function readHomeHQExport(payload) {
  if (Array.isArray(payload)) return payload
  const candidate = payload?.records?.[PROJECT_STORAGE_KEY] ?? payload?.data?.[PROJECT_STORAGE_KEY] ?? payload?.[PROJECT_STORAGE_KEY]
  const parsed = parsedValue(candidate)
  return Array.isArray(parsed) ? parsed : []
}

function amount(value) {
  if (value == null || value === '') return undefined
  const parsed = Number(String(value).replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function canonicalDate(value, field, item, warnings) {
  if (!value) return undefined
  const text = String(value).trim()
  if (isEstateDateValue(text)) return text
  warnings.push(`HomeHQ item ${item.id ?? '(no id)'} has an invalid ${field}; the original value remains in legacy metadata.`)
  return undefined
}

function attachmentInfo(data, declaredType, declaredSize) {
  const text = typeof data === 'string' ? data : ''
  const match = text.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s)
  const mimeType = String(declaredType || match?.[1] || 'application/octet-stream')
  const encoded = match?.[3] || ''
  let calculatedSize = 0
  if (encoded) {
    calculatedSize = match?.[2]
      ? Math.max(0, Math.floor(encoded.replace(/\s/g, '').length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0))
      : (() => {
          try { return new TextEncoder().encode(decodeURIComponent(encoded)).byteLength }
          catch { return new TextEncoder().encode(encoded).byteLength }
        })()
  }
  const sourceDeclaredByteSize = Number.isFinite(Number(declaredSize)) && Number(declaredSize) >= 0 ? Number(declaredSize) : undefined
  const byteSize = match ? calculatedSize : sourceDeclaredByteSize || 0
  return {
    mimeType,
    byteSize,
    sourceDeclaredByteSize,
    sizeMismatch: Boolean(match && sourceDeclaredByteSize != null && sourceDeclaredByteSize !== calculatedSize),
    legacyContentFingerprint: text ? estateFingerprint(text) : '',
    extractionStatus: match ? 'pending_object_storage' : text ? 'external_reference' : 'source_missing',
    legacyExternalUrl: text && !match ? text : undefined,
  }
}

function sourceSnapshot(item) {
  return {
    ...item,
    photos: (item.photos || []).map((photo, index) => ({ index, ...attachmentInfo(photo, '', undefined) })),
    files: (item.files || []).map((file, index) => ({
      index,
      name: file?.name || '',
      ...attachmentInfo(file?.data, file?.type, file?.size),
    })),
  }
}

function sourceMetadata(item, context) {
  return {
    system: HOMEHQ_SOURCE_SYSTEM,
    repository: 'lsljco/brevity',
    legacyStorageKey: PROJECT_STORAGE_KEY,
    legacyId: item.id,
    legacyHash: estateFingerprint(item),
    legacyHashAlgorithm: 'fnv1a32',
    sourceDeviceId: context.sourceDeviceId,
    extractedAt: context.extractedAt,
    migratedAt: context.extractedAt,
    migrationId: context.migrationId,
    legacyPayload: sourceSnapshot(item),
  }
}

function contractorCandidate(item) {
  const companyName = String(item.cname || '').trim()
  if (!companyName) return null
  return {
    key: slugifyEstateValue(companyName),
    companyName,
    phone: String(item.cphone || '').trim(),
    email: String(item.cemail || '').trim().toLowerCase(),
    address: String(item.caddress || '').trim(),
    businessLicenseOnFile: Boolean(item.bizLicense),
    certificateOfInsuranceOnFile: Boolean(item.coi),
    workersCompensationOnFile: Boolean(item.workersComp),
    legacyProjectId: item.id,
  }
}

function contractorComparison(candidate) {
  return {
    companyKey: candidate.key,
    phone: candidate.phone.replace(/\D/g, ''),
    email: candidate.email,
    address: candidate.address.toLowerCase().replace(/\s+/g, ' '),
    businessLicenseOnFile: candidate.businessLicenseOnFile,
    certificateOfInsuranceOnFile: candidate.certificateOfInsuranceOnFile,
    workersCompensationOnFile: candidate.workersCompensationOnFile,
  }
}

function documentRecords(item, target, context, warnings) {
  const records = []
  const relation = target.entityType === 'propertyProject' ? { propertyProjectId: target.id } : { workOrderId: target.id }
  const attachments = [
    ...(item.photos || []).map((data, index) => ({ kind: 'photo', index, name: `${item.title} photo ${index + 1}`, data })),
    ...(item.files || []).map((file, index) => ({ kind: 'file', index, name: file?.name || `${item.title} attachment ${index + 1}`, data: file?.data, type: file?.type, size: file?.size })),
  ]
  for (const attachment of attachments) {
    const info = attachmentInfo(attachment.data, attachment.type, attachment.size)
    if (info.extractionStatus === 'source_missing') warnings.push(`Attachment ${attachment.name} on HomeHQ item ${item.id ?? '(no id)'} has no source bytes.`)
    if (info.sizeMismatch) warnings.push(`Attachment ${attachment.name} on HomeHQ item ${item.id ?? '(no id)'} declares ${info.sourceDeclaredByteSize} bytes but contains ${info.byteSize} bytes.`)
    const legacyAttachmentId = `${item.id ?? estateFingerprint(item)}:${attachment.kind}:${attachment.index}`
    records.push(normalizeEstateEntity('propertyDocument', {
      id: legacyEstateEntityId('propertyDocument', PROJECT_STORAGE_KEY, legacyAttachmentId, { itemId: item.id, ...attachment, data: undefined }),
      propertyId: context.propertyId,
      ...relation,
      name: attachment.name,
      documentType: attachment.kind === 'photo' ? 'photograph' : 'attachment',
      sourceAttachmentKind: attachment.kind,
      sourceAttachmentIndex: attachment.index,
      mimeType: info.mimeType,
      byteSize: info.byteSize,
      sourceDeclaredByteSize: info.sourceDeclaredByteSize,
      storageStatus: info.extractionStatus,
      legacyContentFingerprint: info.legacyContentFingerprint,
      checksumStatus: 'sha256_required',
      legacyExternalUrl: info.legacyExternalUrl,
      status: 'migration_pending',
      sourceMetadata: {
        system: HOMEHQ_SOURCE_SYSTEM,
        repository: 'lsljco/brevity',
        legacyStorageKey: PROJECT_STORAGE_KEY,
        legacyId: legacyAttachmentId,
        legacyHash: info.legacyContentFingerprint,
        legacyHashAlgorithm: 'fnv1a32',
        sourceDeviceId: context.sourceDeviceId,
        extractedAt: context.extractedAt,
        migratedAt: context.extractedAt,
        migrationId: context.migrationId,
        legacyPayload: { itemId: item.id, kind: attachment.kind, index: attachment.index, name: attachment.name, mimeType: info.mimeType, byteSize: info.byteSize },
      },
    }, context.normalization))
  }
  return records
}

export function transformHomeHQExport(payload, options = {}) {
  const sourceItems = readHomeHQExport(payload)
  const propertyId = options.propertyId || MALBEC_PROPERTY_ID
  const householdId = options.householdId || 'lslj-family'
  const extractedAt = options.extractedAt || payload?.exportedAt || payload?.timestamp || new Date().toISOString()
  const sourceDeviceId = options.sourceDeviceId || payload?.sourceDeviceId || 'brevity-shared-state'
  const migrationId = options.migrationId || `homehq-${slugifyEstateValue(sourceDeviceId)}-${String(extractedAt).slice(0, 10)}`
  const warnings = []
  const invalidItems = sourceItems.filter(item => !item || typeof item !== 'object' || Array.isArray(item) || !String(item.title || '').trim())
  const validItems = sourceItems.filter(item => item && typeof item === 'object' && !Array.isArray(item) && String(item.title || '').trim())
  if (invalidItems.length) warnings.push(`${invalidItems.length} HomeHQ item(s) lacked a title or valid record shape and were skipped.`)
  const sourceGroups = new Map()
  for (const item of validItems) {
    const sourceIdentity = item.id == null || String(item.id).trim() === '' ? `hash:${estateFingerprint(item)}` : `id:${String(item.id)}`
    if (!sourceGroups.has(sourceIdentity)) sourceGroups.set(sourceIdentity, [])
    sourceGroups.get(sourceIdentity).push(item)
  }
  const itemConflicts = []
  let duplicateSourceRows = 0
  const items = []
  for (const [sourceIdentity, copies] of sourceGroups) {
    const uniqueHashes = [...new Set(copies.map(estateFingerprint))]
    if (copies.length > 1 && uniqueHashes.length > 1) {
      itemConflicts.push({ sourceIdentity, legacyId: copies[0].id ?? '', copies: copies.map(item => ({ hash: estateFingerprint(item), record: sourceSnapshot(item) })) })
      continue
    }
    duplicateSourceRows += Math.max(0, copies.length - 1)
    items.push(normalizeProjectItem(copies[0]))
  }
  if (duplicateSourceRows) warnings.push(`${duplicateSourceRows} exact duplicate HomeHQ row(s) were collapsed during the dry run.`)
  if (itemConflicts.length) warnings.push(`${itemConflicts.length} duplicate HomeHQ id conflict(s) were quarantined without selecting a winner.`)

  const context = {
    propertyId,
    householdId,
    extractedAt,
    sourceDeviceId,
    migrationId,
    normalization: { householdId, actor: 'migration', now: extractedAt },
  }
  const contractorGroups = new Map()
  for (const item of items) {
    const candidate = contractorCandidate(item)
    if (!candidate) continue
    if (!contractorGroups.has(candidate.key)) contractorGroups.set(candidate.key, [])
    contractorGroups.get(candidate.key).push(candidate)
  }
  const vendorConflicts = []
  const vendorIds = new Map()
  const vendors = []
  for (const [key, candidates] of contractorGroups) {
    const unique = new Map(candidates.map(candidate => [estateFingerprint(contractorComparison(candidate)), candidate]))
    if (unique.size > 1) {
      vendorConflicts.push({ companyKey: key, companyNames: [...new Set(candidates.map(item => item.companyName))], copies: candidates })
      continue
    }
    const candidate = candidates[0]
    const id = `vendor-homehq-${key}`
    vendorIds.set(key, id)
    vendors.push(normalizeEstateEntity('vendor', {
      id,
      companyName: candidate.companyName,
      contacts: [{ phone: candidate.phone, email: candidate.email, address: candidate.address }].filter(contact => Object.values(contact).some(Boolean)),
      businessLicenseOnFile: candidate.businessLicenseOnFile,
      certificateOfInsuranceOnFile: candidate.certificateOfInsuranceOnFile,
      workersCompensationOnFile: candidate.workersCompensationOnFile,
      verificationStatus: 'legacy_unverified',
      propertyIds: [propertyId],
      status: 'active',
      sourceMetadata: {
        system: HOMEHQ_SOURCE_SYSTEM,
        repository: 'lsljco/brevity',
        legacyStorageKey: PROJECT_STORAGE_KEY,
        legacyId: candidate.companyName,
        legacyHash: [...unique.keys()][0],
        legacyHashAlgorithm: 'fnv1a32',
        sourceDeviceId,
        extractedAt,
        migratedAt: extractedAt,
        migrationId,
        legacyPayload: { projectIds: candidates.map(item => item.legacyProjectId), ...candidate, legacyProjectId: undefined },
      },
    }, context.normalization))
  }
  if (vendorConflicts.length) warnings.push(`${vendorConflicts.length} contractor identity conflict(s) require review; affected items retain the legacy company name without a Vendor link.`)

  const propertyProjects = []
  const workOrders = []
  const propertyDocuments = []
  for (const item of items) {
    const isProject = String(item.type || '').toLowerCase() === 'renovation'
    const entityType = isProject ? 'propertyProject' : 'workOrder'
    const id = legacyEstateEntityId(entityType, PROJECT_STORAGE_KEY, item.id, item)
    const contractor = contractorCandidate(item)
    const vendorId = contractor ? vendorIds.get(contractor.key) : undefined
    const common = {
      id,
      propertyId,
      title: String(item.title).trim(),
      scope: String(item.notes || ''),
      physicalLocation: item.room === 'Other' ? String(item.roomCustom || 'Other') : String(item.room || ''),
      priority: String(item.priority || 'Medium').toLowerCase(),
      startDate: canonicalDate(item.startDate, 'startDate', item, warnings),
      dueDate: canonicalDate(item.due, 'dueDate', item, warnings),
      estimatedCost: amount(item.estcost),
      actualCost: amount(item.actcost),
      raci: item.raci,
      vendorId,
      legacyVendorName: contractor?.companyName || '',
      calendarPublishing: {
        enabled: Boolean(item.pushToFamilyCalendar),
        legacySourceId: `project-${item.id}`,
        calendarName: 'Family',
      },
      sourceMetadata: sourceMetadata(item, context),
    }
    const target = isProject
      ? normalizeEstateEntity('propertyProject', { ...common, projectType: 'renovation', status: PROJECT_STATUS[item.status] || 'needs_review', legacyStatus: String(item.status || '') }, context.normalization)
      : normalizeEstateEntity('workOrder', { ...common, workType: String(item.type || 'Maintenance').toLowerCase(), status: WORK_ORDER_STATUS[item.status] || 'needs_review', legacyStatus: String(item.status || '') }, context.normalization)
    if (isProject) propertyProjects.push(target); else workOrders.push(target)
    propertyDocuments.push(...documentRecords(item, target, context, warnings))
  }

  const attachmentBytes = propertyDocuments.reduce((sum, document) => sum + Number(document.byteSize || 0), 0)
  const attachmentByteMismatches = propertyDocuments.filter(document => document.sourceDeclaredByteSize != null && document.sourceDeclaredByteSize !== document.byteSize).length
  const records = { propertyProject: propertyProjects, workOrder: workOrders, vendor: vendors, propertyDocument: propertyDocuments }
  return {
    manifest: {
      migrationId,
      sourceSystem: HOMEHQ_SOURCE_SYSTEM,
      sourceStorageKey: PROJECT_STORAGE_KEY,
      sourceDeviceId,
      extractedAt,
      householdId,
      propertyId,
      dryRunRequired: true,
      importAllowed: false,
      sourceCount: sourceItems.length,
      sourceFingerprint: estateFingerprint(sourceItems),
      counts: Object.fromEntries(Object.entries(records).map(([type, values]) => [type, values.length])),
      attachmentCount: propertyDocuments.length,
      attachmentBytes,
      attachmentByteMismatches,
      attachmentsRequireObjectStorage: propertyDocuments.length > 0,
      vendorConflictCount: vendorConflicts.length,
      itemConflictCount: itemConflicts.length,
      duplicateSourceRows,
      warnings,
    },
    records,
    vendorConflicts,
    itemConflicts,
  }
}

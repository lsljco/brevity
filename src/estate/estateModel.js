export const ESTATE_SCHEMA_VERSION = 1

export const ESTATE_ENTITY_TYPES = Object.freeze([
  'property',
  'propertySystem',
  'asset',
  'maintenancePlan',
  'maintenanceEvent',
  'workOrder',
  'vendor',
  'contract',
  'warranty',
  'propertyProject',
  'inspection',
  'utility',
  'propertyDocument',
  'insurancePolicy',
  'insuranceClaim',
  'propertyExpense',
])

const ENTITY_TYPE_SET = new Set(ESTATE_ENTITY_TYPES)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const REQUIRED_FIELDS = {
  property: ['name'],
  propertySystem: ['propertyId', 'name'],
  asset: ['propertyId', 'propertySystemId', 'name'],
  maintenancePlan: ['propertyId', 'title', 'frequency'],
  maintenanceEvent: ['propertyId', 'title', 'dueDate'],
  workOrder: ['propertyId', 'title'],
  vendor: ['companyName'],
  contract: ['title', 'vendorId'],
  warranty: ['propertyId', 'title'],
  propertyProject: ['propertyId', 'title'],
  inspection: ['propertyId', 'title'],
  utility: ['propertyId', 'serviceType'],
  propertyDocument: ['propertyId', 'name'],
  insurancePolicy: ['propertyId', 'providerName'],
  insuranceClaim: ['propertyId', 'title'],
  propertyExpense: ['propertyId', 'amount'],
}

const DATE_FIELDS = new Set([
  'installedAt', 'purchaseDate', 'nextDueDate', 'dueDate', 'scheduledDate',
  'completedDate', 'effectiveDate', 'expirationDate', 'lossDate', 'expenseDate',
  'startDate', 'endDate',
])

const RELATION_FIELDS = new Set([
  'propertyId', 'propertySystemId', 'assetId', 'maintenancePlanId',
  'maintenanceEventId', 'workOrderId', 'vendorId', 'contractId', 'warrantyId',
  'propertyProjectId', 'inspectionId', 'insurancePolicyId', 'insuranceClaimId',
  'financeTransactionId', 'installerVendorId', 'preferredVendorId', 'parentPropertySystemId',
])

export class EstateValidationError extends Error {
  constructor(errors) {
    super(errors.join(' '))
    this.name = 'EstateValidationError'
    this.errors = errors
  }
}

export function isEstateEntityType(value) {
  return ENTITY_TYPE_SET.has(value)
}

export function slugifyEstateValue(value, fallback = 'record') {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return slug || fallback
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

export function stableEstateJson(value) {
  return JSON.stringify(stableValue(value))
}

export function estateFingerprint(value) {
  const text = stableEstateJson(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function legacyEstateEntityId(entityType, legacyStorageKey, legacyId, record) {
  if (!isEstateEntityType(entityType)) throw new EstateValidationError([`Unknown Estate entity type: ${entityType}.`])
  const fingerprint = estateFingerprint(record).split(':')[1]
  const sourceIdentity = legacyId == null || String(legacyId).trim() === '' ? `hash-${fingerprint}` : slugifyEstateValue(legacyId)
  return `${entityType}-${slugifyEstateValue(legacyStorageKey)}-${sourceIdentity}`
}

export function isEstateDateValue(value) {
  const text = String(value || '')
  if (ISO_DATE.test(text)) {
    const parsed = new Date(`${text}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
  }
  return ISO_TIME.test(text) && Number.isFinite(Date.parse(text))
}

export function normalizeEstateSource(source = {}) {
  if (!source || typeof source !== 'object') return null
  const normalized = {
    system: String(source.system || ''),
    repository: String(source.repository || ''),
    legacyStorageKey: String(source.legacyStorageKey || ''),
    legacyId: source.legacyId == null ? '' : String(source.legacyId),
    legacyHash: String(source.legacyHash || ''),
    legacyHashAlgorithm: String(source.legacyHashAlgorithm || (source.legacyHash ? 'fnv1a32' : '')),
    sourceDeviceId: String(source.sourceDeviceId || ''),
    extractedAt: String(source.extractedAt || ''),
    migratedAt: String(source.migratedAt || ''),
    migrationId: String(source.migrationId || ''),
    legacyPayload: source.legacyPayload ?? null,
  }
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== '' && value != null))
}

export function validateEstateEntity(entityType, entity = {}) {
  const errors = []
  if (!isEstateEntityType(entityType)) errors.push(`Unknown Estate entity type: ${entityType}.`)
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return [...errors, 'Estate entity must be an object.']
  if (!String(entity.id || '').trim()) errors.push('Estate entity id is required.')
  if (!String(entity.householdId || '').trim()) errors.push('Estate householdId is required.')
  for (const field of REQUIRED_FIELDS[entityType] || []) {
    const value = entity[field]
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) errors.push(`${entityType}.${field} is required.`)
  }
  for (const [field, value] of Object.entries(entity)) {
    if (DATE_FIELDS.has(field) && value && !isEstateDateValue(value)) {
      errors.push(`${entityType}.${field} must be an ISO date or timestamp.`)
    }
    if (RELATION_FIELDS.has(field) && value != null && value !== '' && typeof value !== 'string') {
      errors.push(`${entityType}.${field} must be a stable string id.`)
    }
  }
  if (entityType === 'propertyExpense' && !Number.isFinite(Number(entity.amount))) errors.push('propertyExpense.amount must be numeric.')
  if (entityType === 'maintenancePlan') {
    const frequency = entity.frequency
    if (!frequency || typeof frequency !== 'object' || !Number.isInteger(Number(frequency.interval)) || Number(frequency.interval) < 1 || !String(frequency.unit || '')) {
      errors.push('maintenancePlan.frequency requires a positive integer interval and unit.')
    }
  }
  if (!Number.isInteger(Number(entity.version)) || Number(entity.version) < 1) errors.push('Estate entity version must be a positive integer.')
  return errors
}

export function normalizeEstateEntity(entityType, input = {}, context = {}) {
  if (!isEstateEntityType(entityType)) throw new EstateValidationError([`Unknown Estate entity type: ${entityType}.`])
  const now = String(context.now || input.updatedAt || new Date().toISOString())
  const actor = String(context.actor || input.updatedBy || input.createdBy || 'migration')
  const id = String(context.id || input.id || '')
  const householdId = String(context.householdId || input.householdId || '')
  const version = Number(context.version || input.version || 1)
  const normalized = {
    ...input,
    id,
    entityType,
    householdId,
    schemaVersion: ESTATE_SCHEMA_VERSION,
    version,
    createdAt: String(input.createdAt || now),
    createdBy: String(input.createdBy || actor),
    updatedAt: now,
    updatedBy: actor,
    sourceMetadata: normalizeEstateSource(input.sourceMetadata || input.source),
  }
  delete normalized.source
  if (!normalized.sourceMetadata) delete normalized.sourceMetadata
  const errors = validateEstateEntity(entityType, normalized)
  if (errors.length) throw new EstateValidationError(errors)
  return normalized
}

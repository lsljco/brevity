export const ESTATE_SCHEMA_VERSION = 1
export const MALBEC_PROPERTY_ID = 'property-malbec-estate'

export const ESTATE_COLLECTIONS = Object.freeze([
  'systems',
  'assets',
  'maintenancePlans',
  'maintenanceEvents',
  'workOrders',
  'vendors',
  'contracts',
  'warranties',
  'projects',
  'inspections',
  'utilities',
  'documents',
  'insurancePolicies',
  'insuranceClaims',
  'expenses',
])

export const PROPERTY_SYSTEM_CATEGORIES = Object.freeze([
  'Electrical',
  'HVAC',
  'Plumbing',
  'Pool & Wellness',
  'Exterior',
  'Safety & Security',
  'Interior',
  'Grounds',
  'General',
])

export function createEstateWorkspace({
  householdId = 'lslj-family',
  propertyId = MALBEC_PROPERTY_ID,
  propertyName = 'Malbec Estate',
  now = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: ESTATE_SCHEMA_VERSION,
    householdId,
    propertyId,
    property: {
      id: propertyId,
      householdId,
      name: propertyName,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    version: 0,
    createdAt: now,
    updatedAt: now,
    updatedBy: null,
    lastChange: null,
    ...Object.fromEntries(ESTATE_COLLECTIONS.map(collection => [collection, []])),
  }
}

export function normalizeEstateWorkspace(value = {}) {
  const base = createEstateWorkspace({
    householdId: value.householdId,
    propertyId: value.propertyId || value.property?.id,
    propertyName: value.property?.name,
    now: value.createdAt || value.property?.createdAt || new Date().toISOString(),
  })
  const workspace = {
    ...base,
    ...value,
    property: { ...base.property, ...(value.property || {}) },
  }
  ESTATE_COLLECTIONS.forEach(collection => {
    workspace[collection] = Array.isArray(value[collection]) ? value[collection] : []
  })
  return workspace
}

export function validateEstateWorkspace(value) {
  const errors = []
  if (!value || typeof value !== 'object') return ['Estate workspace must be an object.']
  if (Number(value.schemaVersion) !== ESTATE_SCHEMA_VERSION) errors.push(`Estate schemaVersion must be ${ESTATE_SCHEMA_VERSION}.`)
  if (!String(value.householdId || '').trim()) errors.push('Estate householdId is required.')
  if (!String(value.propertyId || '').trim()) errors.push('Estate propertyId is required.')
  if (value.property?.id !== value.propertyId) errors.push('Property id must match propertyId.')
  if (value.property?.householdId !== value.householdId) errors.push('Property householdId must match the workspace householdId.')
  ESTATE_COLLECTIONS.forEach(collection => {
    if (!Array.isArray(value[collection])) errors.push(`${collection} must be an array.`)
  })

  const ids = new Map()
  ;[['property', [value.property]], ...ESTATE_COLLECTIONS.map(collection => [collection, value[collection] || []])].forEach(([collection, records]) => {
    records.forEach((record, index) => {
      if (!record?.id) errors.push(`${collection}[${index}] requires an id.`)
      else if (ids.has(record.id)) errors.push(`Duplicate Estate id ${record.id} appears in ${ids.get(record.id)} and ${collection}.`)
      else ids.set(record.id, collection)
      if (record?.propertyId && record.propertyId !== value.propertyId) errors.push(`${collection}[${index}] references a different property.`)
    })
  })
  ;(value.documents || []).forEach((document, index) => {
    if (!document.storage?.key) errors.push(`documents[${index}] requires durable storage metadata.`)
    if (!document.sha256) errors.push(`documents[${index}] requires a SHA-256 hash.`)
    ;(document.relatedEntityIds || []).forEach(relatedId => {
      if (!ids.has(relatedId)) errors.push(`documents[${index}] references missing Estate entity ${relatedId}.`)
    })
  })
  return errors
}

export function estateWorkspaceSummary(workspace) {
  const value = normalizeEstateWorkspace(workspace)
  const openWorkOrders = value.workOrders.filter(record => !['completed', 'cost_recorded', 'cancelled'].includes(record.status))
  const activeProjects = value.projects.filter(record => !['completed', 'cancelled'].includes(record.status))
  return {
    propertyId: value.propertyId,
    propertyName: value.property.name,
    version: value.version,
    systems: value.systems.length,
    assets: value.assets.length,
    openWorkOrders: openWorkOrders.length,
    overdueMaintenance: openWorkOrders.filter(record => record.dueDate && record.dueDate < new Date().toISOString().slice(0, 10)).length,
    activeProjects: activeProjects.length,
    vendors: value.vendors.length,
    documents: value.documents.length,
    lastUpdatedAt: value.updatedAt,
  }
}

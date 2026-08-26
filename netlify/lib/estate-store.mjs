import { randomUUID } from 'node:crypto'
import { normalizeEstateWorkspace, validateEstateWorkspace } from '../../src/estate/estateModel.js'

const STORE_NAME = 'brevity-estate'
const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120)

export function createEstateRepository({ store, householdId = 'lslj-family', now = () => new Date(), createId = randomUUID }) {
  const household = safeSegment(householdId)
  const workspaceKey = propertyId => `${household}/workspaces/${safeSegment(propertyId)}`
  const backupKey = (propertyId, version) => `${household}/backups/${safeSegment(propertyId)}/v${version}`
  const auditKey = (propertyId, occurredAt, id) => `${household}/audit/${safeSegment(propertyId)}/${occurredAt.slice(0, 10)}/${id}`

  const getWorkspace = async propertyId => store.get(workspaceKey(propertyId), { type: 'json' }).catch(() => null)

  const saveWorkspace = async ({ workspace, expectedVersion, actor, reason = 'estate.updated' }) => {
    const normalized = normalizeEstateWorkspace({ ...workspace, householdId })
    const validationErrors = validateEstateWorkspace(normalized)
    if (validationErrors.length) {
      const error = new Error(validationErrors.join(' '))
      error.code = 'VALIDATION_ERROR'
      throw error
    }
    const current = await getWorkspace(normalized.propertyId)
    const currentVersion = Number(current?.version || 0)
    if (Number(expectedVersion) !== currentVersion) {
      const error = new Error('Estate records changed on another device. Refresh and try again.')
      error.code = 'VERSION_CONFLICT'
      throw error
    }
    const occurredAt = now().toISOString()
    const auditId = createId()
    const next = {
      ...normalized,
      version: currentVersion + 1,
      createdAt: current?.createdAt || normalized.createdAt || occurredAt,
      updatedAt: occurredAt,
      updatedBy: actor,
      property: { ...normalized.property, updatedAt: occurredAt },
      lastChange: { id: auditId, action: reason, actor, occurredAt, fromVersion: currentVersion, toVersion: currentVersion + 1 },
    }
    const audit = {
      id: auditId,
      householdId,
      propertyId: next.propertyId,
      action: reason,
      actor,
      occurredAt,
      fromVersion: currentVersion,
      toVersion: next.version,
      counts: Object.fromEntries(Object.entries(next).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
    }

    await store.setJSON(backupKey(next.propertyId, next.version), next)
    await store.setJSON(workspaceKey(next.propertyId), next)
    await store.setJSON(auditKey(next.propertyId, occurredAt, auditId), audit)
    return next
  }

  return { getWorkspace, saveWorkspace }
}

export async function productionEstateRepository(options = {}) {
  const { getStore } = await import('@netlify/blobs')
  const store = getStore({
    name: STORE_NAME,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
  return createEstateRepository({ store, householdId: process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family', ...options })
}

import { getStore } from '@netlify/blobs'
import { transformHomeHQExport } from '../../src/estate/homehqTransform.js'
import { PROJECT_STORAGE_KEY } from '../../src/homehq/projectData.js'

const HOUSEHOLD_STATE_STORE = 'brevity-household-state'

const recordKey = householdId => `${householdId}/records/${PROJECT_STORAGE_KEY}`

export function configuredHouseholdStateStore() {
  return getStore({
    name: HOUSEHOLD_STATE_STORE,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
}

export async function auditHomeHQBridge({ store = configuredHouseholdStateStore(), householdId, propertyId } = {}) {
  const source = await store.get(recordKey(householdId), { type: 'json' })
  if (!source?.value) return { available: false, sourceStorageKey: PROJECT_STORAGE_KEY, message: 'No synchronized HomeHQ record is available.' }
  let items
  try { items = JSON.parse(source.value) } catch {
    const error = new Error('The synchronized HomeHQ record is not valid JSON.')
    error.status = 422
    throw error
  }
  const result = transformHomeHQExport(items, {
    householdId,
    propertyId,
    sourceDeviceId: 'brevity-shared-state',
    extractedAt: source.updatedAt,
    migrationId: `homehq-shared-state-${String(source.updatedAt || '').slice(0, 10)}`,
  })
  return {
    available: true,
    source: { key: source.key || PROJECT_STORAGE_KEY, hash: source.hash || '', updatedAt: source.updatedAt || '', updatedBy: source.updatedBy || '' },
    manifest: result.manifest,
    vendorConflicts: result.vendorConflicts,
    itemConflicts: result.itemConflicts,
  }
}

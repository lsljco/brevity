import { createHash, randomUUID } from 'node:crypto'
import { normalizeEstateWorkspace, validateEstateWorkspace } from '../../src/estate/estateModel.js'

const STORE_NAME = 'brevity-estate'
const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120)
const missingBlob = error => error?.status === 404 || error?.statusCode === 404 || error?.name === 'NotFoundError'

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export const estateMutationFingerprint = value => createHash('sha256').update(canonicalJson(value)).digest('hex')

const versionConflict = (message, current = null) => {
  const error = new Error(message)
  error.code = 'VERSION_CONFLICT'
  error.current = current
  return error
}

export function createEstateRepository({ store, householdId = 'lslj-family', now = () => new Date(), createId = randomUUID }) {
  const household = safeSegment(householdId)
  const workspaceKey = propertyId => `${household}/workspaces/${safeSegment(propertyId)}`
  const backupKey = (propertyId, version) => `${household}/backups/${safeSegment(propertyId)}/v${version}`
  const auditKey = (propertyId, occurredAt, id) => `${household}/audit/${safeSegment(propertyId)}/${occurredAt.slice(0, 10)}/${id}`
  const artifactStatusKey = (propertyId, version, id) => `${household}/artifact-status/${safeSegment(propertyId)}/v${version}-${safeSegment(id)}`

  const getWorkspaceEntry = async propertyId => {
    let entry
    try {
      entry = await store.getWithMetadata(workspaceKey(propertyId), { type: 'json' })
    } catch (error) {
      if (missingBlob(error)) return { workspace: null, etag: null }
      throw error
    }
    return entry ? { workspace: entry.data, etag: entry.etag || null } : { workspace: null, etag: null }
  }

  const readJSON = async key => {
    try {
      return (await store.getWithMetadata(key, { type: 'json' }))?.data || null
    } catch (error) {
      if (missingBlob(error)) return null
      throw error
    }
  }

  const writeImmutable = async (key, value, matches) => {
    const result = await store.setJSON(key, value, { onlyIfNew: true })
    if (result?.modified !== false) return
    const existing = await readJSON(key)
    if (!existing || !matches(existing)) throw new Error('An immutable Estate history record conflicts with the committed workspace.')
  }

  // The workspace CAS is the durable mutation journal. If backup/audit storage
  // is interrupted after that commit, every later read or write completes the
  // exact artifacts described by lastChange before allowing more mutations.
  const finalizeCommittedArtifacts = async workspace => {
    const change = workspace?.lastChange
    if (!change?.id || !change.occurredAt || !Number.isInteger(Number(change.toVersion))) return workspace
    const statusKey = artifactStatusKey(workspace.propertyId, change.toVersion, change.id)
    const finalized = await readJSON(statusKey)
    if (finalized?.changeId === change.id && Number(finalized.version) === Number(change.toVersion)) return workspace

    const audit = {
      id: change.id,
      householdId,
      propertyId: workspace.propertyId,
      action: change.action,
      actor: change.actor,
      occurredAt: change.occurredAt,
      fromVersion: change.fromVersion,
      toVersion: change.toVersion,
      counts: Object.fromEntries(Object.entries(workspace).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
    }
    await writeImmutable(
      backupKey(workspace.propertyId, change.toVersion),
      workspace,
      existing => Number(existing?.version) === Number(workspace.version) && existing?.lastChange?.id === change.id,
    )
    await writeImmutable(
      auditKey(workspace.propertyId, change.occurredAt, change.id),
      audit,
      existing => existing?.id === change.id && Number(existing?.toVersion) === Number(change.toVersion),
    )
    await writeImmutable(
      statusKey,
      { changeId: change.id, propertyId: workspace.propertyId, version: change.toVersion, finalizedAt: change.occurredAt },
      existing => existing?.changeId === change.id && Number(existing?.version) === Number(change.toVersion),
    )
    return workspace
  }

  const getWorkspace = async propertyId => {
    const workspace = (await getWorkspaceEntry(propertyId)).workspace
    if (workspace) await finalizeCommittedArtifacts(workspace)
    return workspace
  }

  const saveWorkspace = async ({ workspace, expectedVersion, actor, reason = 'estate.updated', requestFingerprint = null, mutationResult = null }) => {
    const normalized = normalizeEstateWorkspace({ ...workspace, householdId })
    const validationErrors = validateEstateWorkspace(normalized)
    if (validationErrors.length) {
      const error = new Error(validationErrors.join(' '))
      error.code = 'VALIDATION_ERROR'
      throw error
    }
    const entry = await getWorkspaceEntry(normalized.propertyId)
    const current = entry.workspace
    if (current) await finalizeCommittedArtifacts(current)
    if (requestFingerprint && current?.lastChange?.requestFingerprint === requestFingerprint) return current
    const currentVersion = Number(current?.version || 0)
    const hasExpectedVersion = expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== ''
    if (current && !hasExpectedVersion) throw versionConflict('Review the current Estate record before replacing it.', current)
    if (!hasExpectedVersion || !Number.isInteger(Number(expectedVersion)) || Number(expectedVersion) < 0) {
      const error = new Error('Estate changes require a valid expectedVersion from the record you reviewed.')
      error.code = 'VALIDATION_ERROR'
      throw error
    }
    if (Number(expectedVersion) !== currentVersion) throw versionConflict('Estate records changed on another device. Refresh and try again.', current)
    if (current && !entry.etag) throw new Error('The Estate workspace did not include a safe storage version marker.')
    const occurredAt = now().toISOString()
    const auditId = createId()
    const next = {
      ...normalized,
      version: currentVersion + 1,
      createdAt: current?.createdAt || normalized.createdAt || occurredAt,
      updatedAt: occurredAt,
      updatedBy: actor,
      property: { ...normalized.property, updatedAt: occurredAt },
      lastChange: {
        id: auditId,
        action: reason,
        actor,
        occurredAt,
        fromVersion: currentVersion,
        toVersion: currentVersion + 1,
        requestFingerprint: requestFingerprint || null,
        mutationResult: mutationResult || null,
      },
    }

    const writeOptions = current ? { onlyIfMatch: entry.etag } : { onlyIfNew: true }
    const committed = await store.setJSON(workspaceKey(next.propertyId), next, writeOptions)
    if (committed?.modified === false) {
      const latest = await getWorkspace(normalized.propertyId)
      throw versionConflict('Estate records changed while this update was being saved. Refresh and try again.', latest)
    }

    await finalizeCommittedArtifacts(next)
    return next
  }

  return { getWorkspace, getWorkspaceEntry, saveWorkspace, finalizeCommittedArtifacts }
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

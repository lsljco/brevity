import { MALBEC_PROPERTY_ID } from './estateModel.js'

export async function fetchEstateWorkspace(propertyId = MALBEC_PROPERTY_ID) {
  const response = await fetch(`/.netlify/functions/estate?propertyId=${encodeURIComponent(propertyId)}`, { credentials: 'include' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Estate records are unavailable.')
  return payload.workspace
}

async function sendMalbecBackup({ backup, sourceInspection, commit = false, expectedVersion = 0 }) {
  const response = await fetch('/.netlify/functions/estate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ backup, sourceInspection, commit, expectedVersion }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Malbec reconciliation could not be completed.')
  return payload
}

export const previewMalbecBackup = input => sendMalbecBackup({ ...input, commit: false })
export const commitMalbecBackup = input => sendMalbecBackup({ ...input, commit: true })

const VAULT_CHUNK_SIZE = 800_000

async function sendVaultAction(body) {
  const propertyId = body.propertyId || MALBEC_PROPERTY_ID
  const response = await fetch(`/.netlify/functions/estate-vault?propertyId=${encodeURIComponent(propertyId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The Estate document could not be imported.')
  return payload
}

export async function importEstateVaultFile({ propertyId = MALBEC_PROPERTY_ID, file, expectedVersion, onProgress }) {
  if (!file?.base64 || !file.id || !file.path || !file.sourceChecksum) throw new Error('The original Malbec file payload is unavailable.')
  const chunks = Array.from({ length: Math.ceil(file.base64.length / VAULT_CHUNK_SIZE) }, (_, index) => file.base64.slice(index * VAULT_CHUNK_SIZE, (index + 1) * VAULT_CHUNK_SIZE))
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    await sendVaultAction({
      action: 'chunk', propertyId, fileId: file.id, sourcePath: file.path, sourceChecksum: file.sourceChecksum,
      chunkIndex, totalChunks: chunks.length, base64: chunks[chunkIndex],
    })
    onProgress?.({ chunkIndex: chunkIndex + 1, totalChunks: chunks.length })
  }
  return sendVaultAction({
    action: 'finalize', propertyId, fileId: file.id, sourcePath: file.path, sourceChecksum: file.sourceChecksum,
    totalChunks: chunks.length, expectedVersion,
  })
}

export const estateDocumentUrl = (documentId, propertyId = MALBEC_PROPERTY_ID) => `/.netlify/functions/estate-vault?propertyId=${encodeURIComponent(propertyId)}&documentId=${encodeURIComponent(documentId)}`

export async function mutateEstateMaintenance({ propertyId = MALBEC_PROPERTY_ID, ...body }) {
  const response = await fetch(`/.netlify/functions/estate-maintenance?propertyId=${encodeURIComponent(propertyId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ propertyId, ...body }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Estate maintenance could not be updated.')
    error.status = response.status
    throw error
  }
  return payload
}

import { MALBEC_PROPERTY_ID } from './estateModel.js'

export async function fetchEstateWorkspace(propertyId = MALBEC_PROPERTY_ID) {
  const response = await fetch(`/.netlify/functions/estate?propertyId=${encodeURIComponent(propertyId)}`, { credentials: 'include' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Estate records are unavailable.')
  return payload.workspace
}

async function sendMalbecBackup({ backup, sourceInspection }) {
  const response = await fetch('/.netlify/functions/estate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ backup, sourceInspection, commit: false }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Malbec reconciliation could not be completed.')
  return payload
}

export const previewMalbecBackup = input => sendMalbecBackup({ ...input, commit: false })

const blockedEstateImport = () => {
  const error = new Error('Estate imports are preview-only in this release. Creating Estate records and uploading Vault documents require Action Mode review, audit history, safe Undo, and version-conflict recovery.')
  error.status = 423
  error.code = 'ACTION_REVIEW_REQUIRED'
  throw error
}

export async function commitMalbecBackup() { blockedEstateImport() }
export async function importEstateVaultFile() { blockedEstateImport() }

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

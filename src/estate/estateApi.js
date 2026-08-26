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

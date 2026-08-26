import { MALBEC_PROPERTY_ID } from './estateModel.js'

export async function fetchEstateWorkspace(propertyId = MALBEC_PROPERTY_ID) {
  const response = await fetch(`/.netlify/functions/estate?propertyId=${encodeURIComponent(propertyId)}`, { credentials: 'include' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Estate records are unavailable.')
  return payload.workspace
}

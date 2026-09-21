import {EXERCISE_IMAGE_ASSETS,canonicalExerciseImage} from './exerciseImageManifest.js'

export const ORIGINAL_EXERCISE_IMAGES=Object.freeze(Object.fromEntries(
  Object.entries(EXERCISE_IMAGE_ASSETS).map(([id,asset])=>[id,asset.replace(/\.webp$/,'')])
))

/**
 * Return a movement-bound source or null. This is a mapping check, not a claim
 * that an image has passed a human review of anatomy, form, identity, or gaze.
 * Missing/mismatched images must not fall back to another exercise photograph.
 */
export function getDisplayExerciseImage(exercise) {
  const id = exercise?.id
  const source = exercise?.image
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id) || typeof source !== 'string') return null
  // Only bundled assets or the authenticated generated-image route are supported.
  if (!source.startsWith('/') || source.startsWith('//') || source.includes('\\')) return null
  let url
  try { url = new URL(source, 'https://brevity.invalid') } catch { return null }
  if (url.origin !== 'https://brevity.invalid') return null
  const canonical=canonicalExerciseImage(id)
  if(canonical&&url.pathname===canonical&&!url.search&&!url.hash)return source
  if (url.pathname !== '/.netlify/functions/fitness-images' || url.searchParams.getAll('id').length !== 1) return null
  const assetId = url.searchParams.get('id') || ''
  // Generated IDs are created server-side as exerciseId-member-randomUUID.
  const suffix = assetId.startsWith(`${id}-`) ? assetId.slice(id.length + 1) : ''
  return /^(larry|lorenzo|terica|nyla|javin|isaiah)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suffix) ? source : null
}

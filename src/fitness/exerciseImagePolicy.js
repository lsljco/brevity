// Exact movement-to-asset bindings. A shared muscle group is not an image match.
// These legacy bindings describe the original assignments, not visual approval.
// Audit the remaining originals before considering the replacement project done.
export const ORIGINAL_EXERCISE_IMAGES = Object.freeze({
  'incline-press': 'family-lorenzo-incline-press-v1',
  'cable-fly': 'family-terica-cable-fly-v1',
  'push-up': 'family-larry-push-up-v1',
  'lat-pulldown': 'family-javin-lat-pulldown-v1',
  'chest-row': 'family-chest-supported-row-v2',
  'single-row': 'family-nyla-single-arm-row-v1',
  'shoulder-press': 'family-shoulder-press-v2',
  'lateral-raise': 'family-lateral-raise-v2',
  'reverse-fly': 'family-reverse-fly-v2',
  'face-pull': 'family-face-pull-v2',
  'hammer-curl': 'family-hammer-curl-v2',
  'rope-triceps': 'family-triceps-pressdown-v2',
  'goblet-squat': 'family-goblet-squat-v2',
  'romanian-deadlift': 'family-romanian-deadlift-v2',
  'reverse-lunge': 'family-reverse-lunge-v2',
  'hip-thrust': 'family-hip-thrust-v2',
  'leg-curl': 'family-leg-curl-v2',
  'step-up': 'family-step-up-v2',
  'glute-kickback': 'family-glute-kickback-v2',
  'calf-raise': 'family-calf-raise-v2',
  'ab-wheel': 'family-ab-wheel-v2',
  'hanging-raise': 'family-hanging-knee-raise-v2',
  'dead-bug': 'family-isaiah-dead-bug-v1',
  'plank': 'family-front-plank-v2',
  'incline-walk': 'family-incline-walk-v2',
})

// The camera-facing images reported in the September 20 screenshot review.
const WITHDRAWN_IMAGES = new Set([
  'family-terica-cable-fly-v1', 'family-larry-push-up-v1',
  'family-shoulder-press-v2', 'family-javin-lat-pulldown-v1',
])

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
  const original = ORIGINAL_EXERCISE_IMAGES[id]
  if (original && !WITHDRAWN_IMAGES.has(original) && url.pathname === `/fitness/exercises/${original}.webp`) return source
  if (url.pathname !== '/.netlify/functions/fitness-images' || url.searchParams.getAll('id').length !== 1) return null
  const assetId = url.searchParams.get('id') || ''
  // Generated IDs are created server-side as exerciseId-member-randomUUID.
  const suffix = assetId.startsWith(`${id}-`) ? assetId.slice(id.length + 1) : ''
  return /^(larry|lorenzo|terica|nyla|javin|isaiah)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suffix) ? source : null
}

const CHARACTER_COUNT = 6

export const SERMON_CHARACTER_REFERENCES = Object.freeze(
  Array.from({ length:CHARACTER_COUNT }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return Object.freeze({
      id:`approved-character-${number}`,
      fileName:`approved-character-${number}.jpg`,
      mimeType:'image/jpeg',
      url:new URL(`../assets/sermon-characters/approved-character-${number}.jpg`, import.meta.url),
    })
  }),
)

export const SERMON_CHARACTER_IDENTITY_PROMPT = [
  'The attached image is an approved character identity reference only.',
  'When a human subject is appropriate for this sermon visual, preserve the recognizable facial identity and permanent physical characteristics of this one referenced character.',
  'Do not copy the reference pose, facial expression, gaze, head angle, clothing, background, crop, camera angle, or composition.',
  'Freely change expression, posture, body position, wardrobe, lighting, perspective, environment, and action to fit the sermon concept.',
  'Never blend this identity with another person or invent a hybrid identity.',
  'If the theological concept is stronger without a visible person, do not force the referenced character into the scene.',
].join(' ')

function hashSeed(value) {
  let hash = 2166136261
  for (const char of String(value || 'sermon')) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function sermonCharacterReferenceFor(seed, index = 0) {
  const references = SERMON_CHARACTER_REFERENCES
  if (!references.length) return null
  const start = hashSeed(seed) % references.length
  return references[(start + Math.max(0, Number(index) || 0)) % references.length]
}

export function sermonCharacterSequence(seed, count) {
  return Array.from({ length:Math.max(0, Number(count) || 0) }, (_, index) => sermonCharacterReferenceFor(seed, index))
}

const clean = value => String(value || '').replace(/\s+/g, ' ').trim()

export const MEAL_IMAGE_STORE = 'brevity-meal-images'
export const mealImageKey = (householdId, assetId) => `${String(householdId || 'lslj-family').replace(/[^a-zA-Z0-9_-]/g, '-')}/meals/${String(assetId || '').replace(/[^a-zA-Z0-9_-]/g, '')}.png`

export function buildMealImagePrompt(meal = {}) {
  const ingredients = (Array.isArray(meal.ingredients) ? meal.ingredients : []).map(clean).filter(Boolean).slice(0, 20).join(', ')
  return `Create a premium editorial food photograph of ${clean(meal.name)}. ${clean(meal.description)} Ingredients and plating cues: ${ingredients || 'use the meal description faithfully'}. Luxury restaurant and private-chef cookbook aesthetic, ultra-photorealistic food photography, dramatic controlled lighting, deep black and navy shadow structure, warm antique-gold highlights, ivory tableware where appropriate, rich authentic food texture, sophisticated plating, appetizing but natural proportions, shallow depth of field, restrained elegant composition, no generic stock-photo appearance. Show only the finished meal and appropriate table setting. No people, hands, words, lettering, logos, packaging, watermarks, collages, or split screens. Landscape 3:2 composition suitable for a meal-library card.`
}

export function assertMealImagePng(value) {
  const bytes = Buffer.from(value || [])
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < signature.length || !signature.every((byte, index) => bytes[index] === byte)) {
    const error = new Error('Meal image generation returned an unsupported file. Brevity accepts generated PNG meal images only.')
    error.code = 'IMAGE_GENERATION_ERROR'
    throw error
  }
  return bytes
}

export async function generateMealImage({ meal, assetId, householdId = 'lslj-family', store, fetcher = fetch }) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('Meal image generation is not configured.'), { code:'IMAGE_GENERATION_ERROR' })
  const response = await fetcher('https://api.openai.com/v1/images/generations', {
    method:'POST',
    headers:{ authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'content-type':'application/json' },
    body:JSON.stringify({
      model:process.env.BREVITY_IMAGE_MODEL || 'gpt-image-2',
      prompt:buildMealImagePrompt(meal),
      size:'1536x1024',
      quality:'medium',
      output_format:'png',
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `Meal image generation returned ${response.status}.`), { code:'IMAGE_GENERATION_ERROR' })
  const encoded = payload.data?.[0]?.b64_json
  if (!encoded) throw Object.assign(new Error('Meal image generation returned no image.'), { code:'IMAGE_GENERATION_ERROR' })
  const bytes = assertMealImagePng(Buffer.from(encoded, 'base64'))
  await store.set(mealImageKey(householdId, assetId), bytes)
  return `/.netlify/functions/meal-images?id=${encodeURIComponent(assetId)}`
}

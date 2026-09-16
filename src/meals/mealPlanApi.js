const ENDPOINT = '/.netlify/functions/meal-plans'
const ACTION_ENDPOINT = '/.netlify/functions/brevity-assistant-actions'
const REQUEST_TIMEOUT_MS = 20000

async function request(url, { timeoutMs = REQUEST_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { credentials: 'include', ...options, signal: controller.signal })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(body.error || `Meal-plan API returned ${response.status}.`)
      error.status = response.status
      throw error
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

export function fetchRollingMealPlan(startDate) {
  const query = startDate ? `?startDate=${encodeURIComponent(startDate)}` : ''
  return request(`${ENDPOINT}${query}`)
}

export function createMealLibraryItem(meal) {
  return request(ENDPOINT, {
    timeoutMs: 90000,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(meal),
  })
}

export function regenerateMealImage(mealId) {
  return request(ENDPOINT, {
    timeoutMs:90000,
    method:'PUT',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ action:'regenerate-image', mealId }),
  })
}

const blobBase64 = blob => new Promise((resolve,reject)=>{
  const reader=new FileReader()
  reader.onerror=()=>reject(new Error('Brevity could not read that image.'))
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'')
  reader.readAsDataURL(blob)
})

export async function uploadMealImage(mealId,file) {
  if(!file?.type?.startsWith('image/'))throw new Error('Choose a PNG, JPEG, or WebP image.')
  const bitmap=await createImageBitmap(file)
  const scale=Math.min(1,1536/bitmap.width,1024/bitmap.height)
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
  bitmap.close?.()
  const optimized=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Brevity could not prepare that image.')),'image/jpeg',.9))
  const imageBase64=await blobBase64(optimized)
  return request(ENDPOINT,{
    timeoutMs:90000,
    method:'PUT',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'upload-image',mealId,imageBase64}),
  })
}

export function calculateMealNutrition(ingredients, yieldQuantity, yieldUnit) {
  return request('/.netlify/functions/meal-nutrition', {
    timeoutMs: 45000,
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ ingredients, yieldQuantity, yieldUnit }),
  })
}

export function importRecipeFromUrl(url) {
  return request('/.netlify/functions/recipe-import', {
    timeoutMs:25000,
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ url }),
  })
}

export function prepareMealSubstitution({ date, mealType, mealId, expectedVersion }) {
  return request(`${ACTION_ENDPOINT}?action=prepare-meal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, mealType, mealId, expectedVersion }),
  })
}

export function executeMealSubstitution(proposalId) {
  return request(`${ACTION_ENDPOINT}?action=execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposalId, confirmed: true }),
  })
}

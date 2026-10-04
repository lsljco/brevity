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

export function fetchRollingMealPlan(startDate, count = 7) {
  const query = startDate ? `?startDate=${encodeURIComponent(startDate)}${count === 7 ? '' : `&count=${encodeURIComponent(count)}`}` : ''
  return request(`${ENDPOINT}${query}`)
}

export function createMealLibraryItem(meal) {
  return request(ENDPOINT, {
    timeoutMs: 90000,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(meal),
  }).then(result=>{ensureMealImage(result.meal).catch(()=>undefined);return result})
}

export function createMealLibraryBatch(meals) {
  return request(ENDPOINT, { timeoutMs:45000, method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'bulk-create',meals}) }).then(result=>{result.meals?.forEach(meal=>ensureMealImage(meal).catch(()=>undefined));return result})
}

export function regenerateMealImage(mealId, {onlyIfMissing=false}={}) {
  const jobId=onlyIfMissing?`auto-${mealId}`:globalThis.crypto?.randomUUID?.()||`meal-image-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return request('/.netlify/functions/meal-image-generate-background', {
    timeoutMs:15000,
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jobId,mealId,onlyIfMissing}),
  }).then(async()=>{
    const deadline=Date.now()+180000
    while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,2000))
      const job=await request(`/.netlify/functions/meal-image-job-status?jobId=${encodeURIComponent(jobId)}`,{timeoutMs:10000})
      if(job.state==='ready')return{meal:job.meal}
      if(job.state==='error')throw new Error(job.error||'Brevity could not generate the meal image.')
    }
    throw new Error('The image is still being generated. Keep this meal open and try again shortly.')
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

export async function calculateMealNutrition(ingredients, yieldQuantity, yieldUnit) {
  const jobId=globalThis.crypto.randomUUID()
  await request('/.netlify/functions/meal-nutrition-background', {
    timeoutMs:15000, method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({jobId,ingredients,yieldQuantity,yieldUnit}),
  })
  const deadline=Date.now()+180000
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,1500))
    let job
    try{job=await request(`/.netlify/functions/meal-nutrition-job-status?jobId=${encodeURIComponent(jobId)}`,{timeoutMs:10000})}
    catch(error){if(error.name==='AbortError'||error instanceof TypeError||error.status>=500)continue;throw error}
    if(job.state==='ready')return {nutrition:job.nutrition}
    if(job.state==='error')throw new Error(job.error||'Nutrition calculation failed. Your recipe is still here; please try again.')
  }
  throw new Error('Nutrition calculation is taking longer than expected. Your recipe is still here; please try calculating again.')
}

export function importRecipeFromUrl(url) {
  return request('/.netlify/functions/recipe-import', {
    timeoutMs:25000,
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ url }),
  })
}

export async function importMealsFromImage(file, {packagedFood=false}={}) {
  if (!['image/jpeg','image/png','image/webp'].includes(file?.type)) throw new Error('Choose a JPEG, PNG, or WebP image.')
  const bitmap=await createImageBitmap(file)
  const scale=Math.min(1,1600/bitmap.width,1600/bitmap.height)
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
  bitmap.close?.()
  const optimized=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the image.')),'image/jpeg',.88))
  if(optimized.size>5*1024*1024)throw new Error('Choose an image smaller than 5 MB.')
  return request('/.netlify/functions/meal-image-import',{timeoutMs:60000,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mimeType:'image/jpeg',imageBase64:await blobBase64(optimized),packagedFood})})
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

const automaticImages=new Map()
const imageStates=new Map()
export const mealImageState=id=>imageStates.get(id)||'idle'
const announceImageState=(mealId,state)=>{imageStates.set(mealId,state);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('brevity-meal-image-state',{detail:{mealId,state}}))}
let imageQueue=Promise.resolve()
export function ensureMealImage(meal){
  if(!meal?.id||meal.image&&!meal.imageFallback)return Promise.resolve({meal})
  if(automaticImages.has(meal.id))return automaticImages.get(meal.id)
  announceImageState(meal.id,'queued')
  const pending=imageQueue.then(()=>{announceImageState(meal.id,'generating');return regenerateMealImage(meal.id,{onlyIfMissing:true})}).then(result=>{
    announceImageState(meal.id,'ready')
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('brevity-meal-image-ready',{detail:{meal:result.meal}}))
    return result
  }).catch(error=>{announceImageState(meal.id,'error');throw error})
  automaticImages.set(meal.id,pending)
  imageQueue=pending.catch(()=>undefined)
  return pending
}

export const lookupPackagedFood = barcode => request('/.netlify/functions/packaged-food-lookup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({barcode})})

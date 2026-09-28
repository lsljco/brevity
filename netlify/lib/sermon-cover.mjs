import { createHash } from 'node:crypto'

export const COVER_STORE='brevity-sermon-covers'
export const COVER_JOB_STORE='brevity-sermon-cover-jobs'
const safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)
export const coverKey=(householdId,assetId)=>`${safe(householdId)}/covers/${safe(assetId)}.png`
export const coverJobKey=(householdId,sermonId)=>`${safe(householdId)}/jobs/${safe(sermonId)}.json`
export const coverSourceHash=sermon=>createHash('sha256').update(JSON.stringify({title:sermon.title||'',bigIdea:sermon.bigIdea||'',scripture:sermon.scripture||'',outline:String(sermon.outline||'').slice(0,2500)})).digest('hex')
const clean=(value,max=800)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max)

export function buildSermonCoverPrompt(sermon){
  return `Create ONE ultra-photorealistic editorial photograph for a sermon cover. Sermon title: ${clean(sermon.title,180)}. Central idea: ${clean(sermon.bigIdea,600)}. Scripture context: ${clean(sermon.scripture,240)}. Source theme: ${clean(sermon.outline,800)}. Interpret the central theme as a believable physical scene with thoughtful symbolism, authentic materials and imperfect real-world texture. Luxury magazine photography, cinematic but natural light, nuanced black and charcoal shadows with warm antique-gold highlights, restrained neutral color, deep atmosphere and precise photographic detail. Landscape 3:2 composition, compelling focal point, usable as a small thumbnail beside a title. People are optional only when the theme needs them; no identifiable likeness of Lorenzo or anyone else. No text, letters, numbers, logos, title treatment, collage, painting, illustration, synthetic glow, fantasy effects, plastic skin, or generic AI art. Do not depict God or claim a literal biblical event. The application will render the actual title separately.`
}

export async function generateSermonCover({sermon,assetId,householdId,store,fetcher=fetch,apiKey=process.env.OPENAI_API_KEY}){
  if(!apiKey)throw Error('Image generation is not configured.')
  const response=await fetcher('https://api.openai.com/v1/images/generations',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.BREVITY_IMAGE_MODEL||'gpt-image-2',prompt:buildSermonCoverPrompt(sermon),size:'1536x1024',quality:'high',output_format:'png'})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw Error(payload.error?.message||`Image generation returned ${response.status}.`)
  const bytes=Buffer.from(payload.data?.[0]?.b64_json||'','base64')
  if(bytes.length<8||!Buffer.from([137,80,78,71,13,10,26,10]).equals(bytes.subarray(0,8)))throw Error('Image generation did not return a valid PNG.')
  await store.set(coverKey(householdId,assetId),bytes)
  return `/.netlify/functions/sermon-cover?assetId=${encodeURIComponent(assetId)}`
}

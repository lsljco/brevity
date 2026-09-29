import { createHash } from 'node:crypto'
import { familyFitnessReference } from './fitness-image.mjs'

export const COVER_STORE='brevity-sermon-covers'
export const COVER_JOB_STORE='brevity-sermon-cover-jobs'
const safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)
export const coverKey=(householdId,assetId)=>`${safe(householdId)}/covers/${safe(assetId)}.png`
export const coverJobKey=(householdId,sermonId)=>`${safe(householdId)}/jobs/${safe(sermonId)}.json`
export const coverSourceHash=sermon=>createHash('sha256').update(JSON.stringify({policy:2,title:sermon.title||'',bigIdea:sermon.bigIdea||'',scripture:sermon.scripture||'',outline:String(sermon.outline||'').slice(0,2500)})).digest('hex')
const clean=(value,max=800)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max)

export function buildSermonCoverPrompt(sermon){
  return `Create ONE ultra-photorealistic editorial photograph for a sermon cover. Sermon title: ${clean(sermon.title,180)}. Central idea: ${clean(sermon.bigIdea,600)}. Scripture context: ${clean(sermon.scripture,240)}. Source theme: ${clean(sermon.outline,800)}. Interpret the central theme as a believable physical scene with thoughtful symbolism, authentic materials and imperfect real-world texture. Luxury magazine photography, cinematic but natural light, nuanced black and charcoal shadows with warm antique-gold highlights, restrained neutral color, deep atmosphere and precise photographic detail. Landscape 3:2 composition, compelling focal point, usable as a small thumbnail beside a title. Show no people, faces, silhouettes, or human figures because this cover has no attached household identity reference. No text, letters, numbers, logos, title treatment, collage, painting, illustration, synthetic glow, fantasy effects, plastic skin, or generic AI art. Do not depict God or claim a literal biblical event. The application will render the actual title separately.`
}

export const postImageJobKey=(householdId,sermonId,postId)=>`${safe(householdId)}/post-images/${safe(sermonId)}/${safe(postId)}.json`
export const SERMON_PHOTO_SUBJECTS=Object.freeze(['none','Larry','Lorenzo','Javin','Isaiah','Terica','Nyla'])
export const SERMON_IDENTITY_STORE='brevity-sermon-identities'
export const sermonIdentityKey=(householdId,member)=>`${safe(householdId)}/references/${safe(member)}.jpg`
export const sermonIdentityMetaKey=(householdId,member)=>`${safe(householdId)}/references/${safe(member)}.json`
export function defaultPostSubject(post){
  const words=`${post.title||''} ${post.content||''}`.toLowerCase()
  if(/\b(girl|daughter|young woman)\b/.test(words))return 'Nyla'
  if(/\b(boy|son|young man|child|children)\b/.test(words))return 'Isaiah'
  if(/\b(woman|mother|wife|sister)\b/.test(words))return 'Terica'
  if(/\b(man|father|husband|brother|preacher)\b/.test(words))return 'Lorenzo'
  return 'none'
}
export const postImageSourceHash=(sermon,post,subject=defaultPostSubject(post),identityVersion='')=>createHash('sha256').update(JSON.stringify({policy:2,title:sermon.title,bigIdea:sermon.bigIdea,scripture:sermon.scripture,post:post.content,postTitle:post.title,subject,identityVersion})).digest('hex')
export function buildFacebookPhotoPrompt(sermon,post,subject=defaultPostSubject(post)){
  const person=subject==='none'?'Show no people, faces, silhouettes, or human figures. Use a physical scene or object as the visual metaphor.':`Show at most one human subject, ${subject}, matching the attached approved identity reference. This is the only person permitted in the scene. Preserve their recognizable face and permanent characteristics. Do not copy the reference pose, outfit, setting, or expression. Keep their action and gaze natural to the story; no posed camera-facing portrait.`
  return `Create one ultra-photorealistic editorial photograph that specifically accompanies this Facebook sermon post. Sermon: ${clean(sermon.title,180)}. Scripture: ${clean(sermon.scripture,240)}. Message: ${clean(sermon.bigIdea,400)}. Post title: ${clean(post.title,200)}. Post copy: ${clean(post.content,1100)}. ${person} Depict a concrete, believable physical scene that conveys the post's distinct idea. Do not repeat a generic lighthouse or reuse the sermon cover composition. Luxury editorial photography, authentic real-world texture, natural cinematic light, restrained charcoal and antique gold palette, nuanced shadows, emotionally resonant but not posed. Landscape 3:2. No text, letters, logos, collage, illustration, synthetic glow, plastic skin, or generic AI art. Do not depict God or imply a literal photograph of a biblical event. No additional people.`
}
export async function sermonSubjectReference(subject,{identityStore,householdId='lslj-family',environment=process.env}={}){
  if(subject==='none')return null
  if(!SERMON_PHOTO_SUBJECTS.includes(subject))throw Error('Choose an approved household member.')
  const privateImage=await identityStore?.get(sermonIdentityKey(householdId,subject),{type:'arrayBuffer'})
  if(privateImage)return {bytes:Buffer.from(privateImage),fileName:`${subject.toLowerCase()}.jpg`}
  const reference=familyFitnessReference(subject)?.references?.[0]
  const encoded=reference&&environment[reference.envVar]
  if(!encoded)throw Error(`Upload an approved ${subject} identity photograph before generating this image.`)
  return {bytes:Buffer.from(encoded,'base64'),fileName:reference.fileName}
}
export async function generateSermonCover({sermon,assetId,householdId,store,prompt=buildSermonCoverPrompt(sermon),reference=null,fetcher=fetch,apiKey=process.env.OPENAI_API_KEY}){
  if(!apiKey)throw Error('Image generation is not configured.')
  let response
  if(reference){
    const form=new FormData();form.append('model',process.env.BREVITY_IMAGE_MODEL||'gpt-image-2');form.append('image[]',new Blob([reference.bytes],{type:'image/jpeg'}),reference.fileName);form.append('prompt',prompt);form.append('size','1536x1024');form.append('quality','high');form.append('output_format','png')
    response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{authorization:`Bearer ${apiKey}`},body:form})
  }else response=await fetcher('https://api.openai.com/v1/images/generations',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.BREVITY_IMAGE_MODEL||'gpt-image-2',prompt,size:'1536x1024',quality:'high',output_format:'png'})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw Error(payload.error?.message||`Image generation returned ${response.status}.`)
  const bytes=Buffer.from(payload.data?.[0]?.b64_json||'','base64')
  if(bytes.length<8||!Buffer.from([137,80,78,71,13,10,26,10]).equals(bytes.subarray(0,8)))throw Error('Image generation did not return a valid PNG.')
  await store.set(coverKey(householdId,assetId),bytes)
  return `/.netlify/functions/sermon-cover?assetId=${encodeURIComponent(assetId)}`
}

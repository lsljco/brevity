import { readFile } from 'node:fs/promises'

const clean=value=>String(value||'').replace(/\s+/g,' ').trim()
const safe=value=>clean(value).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,80)

export const FITNESS_IMAGE_STORE='brevity-fitness-images'
export const FITNESS_IMAGE_JOB_STORE='brevity-fitness-image-jobs'
export const FITNESS_MEMBERS=Object.freeze(['Larry','Lorenzo','Isaiah','Nyla','Javin','Terica'])

const reference=(fileName,role='face')=>Object.freeze({fileName,mimeType:'image/jpeg',role,url:new URL(`../assets/fitness-members/${fileName}`,import.meta.url)})
export const FITNESS_MEMBER_REFERENCES=Object.freeze({
  Larry:Object.freeze([reference('larry-face.jpg')]),
  Lorenzo:Object.freeze([reference('lorenzo-face.jpg')]),
  Isaiah:Object.freeze([reference('isaiah-face.jpg')]),
  Nyla:Object.freeze([reference('nyla-face.jpg')]),
  Javin:Object.freeze([reference('javin-face.jpg')]),
  Terica:Object.freeze([reference('terica-face.jpg','facial identity lock'),reference('terica-hair.jpg','hairstyle reference')]),
})

export const FITNESS_EXERCISES=Object.freeze({
  'incline-press':['Incline dumbbell press','upper chest, front deltoids, and triceps'],
  'cable-fly':['Low-to-high cable fly','upper chest and front deltoids'],
  'push-up':['Push-up','chest, triceps, and core'],
  'lat-pulldown':['Wide-neutral lat pulldown','lats, upper back, and biceps'],
  'chest-row':['Chest-supported row','mid-back, lats, and rear deltoids'],
  'single-row':['Single-arm cable row','lats, mid-back, and biceps'],
  'shoulder-press':['Seated dumbbell shoulder press','front and side deltoids and triceps'],
  'lateral-raise':['Dumbbell lateral raise','side deltoids'],
  'reverse-fly':['Chest-supported reverse fly','rear deltoids and upper back'],
  'face-pull':['Cable face pull','rear deltoids, upper back, and rotator cuff'],
  'hammer-curl':['Hammer curl','biceps, brachialis, and forearms'],
  'rope-triceps':['Rope triceps pressdown','triceps'],
  'goblet-squat':['Goblet squat','quadriceps, glutes, and core'],
  'romanian-deadlift':['Romanian deadlift','hamstrings, glutes, and back extensors'],
  'reverse-lunge':['Reverse lunge','glutes, quadriceps, and adductors'],
  'hip-thrust':['Barbell hip thrust','glutes and hamstrings'],
  'leg-curl':['Seated leg curl','hamstrings'],
  'step-up':['Dumbbell step-up','glutes, quadriceps, and core'],
  'glute-kickback':['Cable glute kickback','glutes'],
  'calf-raise':['Standing calf raise','calves'],
  'ab-wheel':['Ab-wheel rollout','deep core, rectus abdominis, and lats'],
  'hanging-raise':['Hanging knee raise','lower abs, deep core, and hip flexors'],
  'dead-bug':['Dead bug','deep core and rectus abdominis'],
  'plank':['Front plank','deep core, abs, and shoulders'],
  'incline-walk':['Incline treadmill walk','cardiovascular system, glutes, and calves'],
})

export const fitnessImageKey=(householdId,member,exerciseId)=>`${safe(householdId)||'lslj-family'}/members/${safe(member)}/${safe(exerciseId)}.png`
export const fitnessImageJobKey=(householdId,jobId)=>`${safe(householdId)||'lslj-family'}/jobs/${safe(jobId)}.json`
export const fitnessImageUrl=(member,exerciseId,version='')=>`/.netlify/functions/fitness-images?member=${encodeURIComponent(member)}&exerciseId=${encodeURIComponent(exerciseId)}${version?`&v=${encodeURIComponent(version)}`:''}`

export function validateFitnessImageRequest(member,exerciseIds){
  if(!FITNESS_MEMBERS.includes(member))throw Object.assign(new Error('Choose a valid household member.'),{code:'VALIDATION_ERROR'})
  const ids=[...new Set((Array.isArray(exerciseIds)?exerciseIds:[]).map(safe).filter(Boolean))]
  if(!ids.length||ids.length>8||ids.some(id=>!FITNESS_EXERCISES[id]))throw Object.assign(new Error('Choose one to eight exercises from the household library.'),{code:'VALIDATION_ERROR'})
  return{member,exerciseIds:ids}
}

export function buildFitnessImagePrompt({member,exerciseId}){
  const [name,muscles]=FITNESS_EXERCISES[exerciseId]||[]
  if(!name)throw Object.assign(new Error('That exercise is not in the household library.'),{code:'VALIDATION_ERROR'})
  const isYouth=member==='Isaiah'
  const referenceNote=member==='Terica'
    ? 'Image 1 is the facial identity lock. Preserve that face precisely. Image 2 is the hairstyle reference. Use that hairstyle while keeping Image 1 as the face identity; never blend the two faces.'
    : 'Image 1 is the identity lock. Preserve this person’s recognizable face and permanent physical characteristics; do not copy the reference pose, clothing, or background.'
  const ageNote=isYouth
    ? 'The subject is a child. Show age-appropriate, adult-supervised technique, modest athletic clothing, light age-appropriate resistance, and a safe non-bodybuilding presentation.'
    : 'Show an athletic adult in tasteful premium training apparel with realistic proportions; do not exaggerate musculature or alter identity.'
  return `Create a premium photorealistic editorial fitness photograph for Brevity’s exercise library. Subject: ${member}, performing ${name} with anatomically credible, safe form. Target muscles: ${muscles}. ${referenceNote} ${ageNote} Men’s Health-quality fitness editorial photography, upscale modern gym, dramatic controlled lighting, deep charcoal and navy shadows, warm antique-gold highlights, authentic skin and fabric texture, sharp face and body, natural exertion, landscape 3:2 composition, full exercise setup visible, camera angle that clearly teaches the movement. One person only. No trainer unless required for child safety, no words, labels, logos, watermarks, collage, split screen, duplicated limbs, unsafe equipment position, or incorrect exercise.`
}

export function assertFitnessImagePng(value){
  const bytes=Buffer.from(value||[]),signature=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]
  if(bytes.length<signature.length||!signature.every((byte,index)=>bytes[index]===byte))throw Object.assign(new Error('Fitness image generation returned an unsupported file.'),{code:'IMAGE_GENERATION_ERROR'})
  return bytes
}

async function imageResponse(response){
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw Object.assign(new Error(payload.error?.message||`Fitness image generation returned ${response.status}.`),{code:'IMAGE_GENERATION_ERROR'})
  const encoded=payload.data?.[0]?.b64_json
  if(!encoded)throw Object.assign(new Error('Fitness image generation returned no image.'),{code:'IMAGE_GENERATION_ERROR'})
  return assertFitnessImagePng(Buffer.from(encoded,'base64'))
}

export async function generateFitnessImage({member,exerciseId,householdId='lslj-family',store,fetcher=fetch}){
  if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error('Fitness image generation is not configured.'),{code:'IMAGE_GENERATION_ERROR'})
  validateFitnessImageRequest(member,[exerciseId])
  const references=FITNESS_MEMBER_REFERENCES[member]
  const form=new FormData()
  form.append('model',process.env.BREVITY_IMAGE_MODEL||'gpt-image-2')
  for(const item of references){
    const bytes=await readFile(item.url)
    form.append('image[]',new Blob([bytes],{type:item.mimeType}),item.fileName)
  }
  form.append('prompt',buildFitnessImagePrompt({member,exerciseId}))
  form.append('size','1536x1024');form.append('quality','high');form.append('output_format','png')
  const response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form})
  const bytes=await imageResponse(response)
  await store.set(fitnessImageKey(householdId,member,exerciseId),bytes)
  return fitnessImageUrl(member,exerciseId,Date.now())
}

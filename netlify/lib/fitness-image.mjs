import { readFile } from 'node:fs/promises'

export const FITNESS_IMAGE_STORE='brevity-fitness-images'
export const FITNESS_IMAGE_JOB_STORE='brevity-fitness-image-jobs'
const MEMBER_NUMBER={Larry:'01',Lorenzo:'02',Isaiah:'03',Nyla:'04',Javin:'05',Terica:'06'}
export const fitnessImageKey=(householdId,assetId)=>`${String(householdId||'lslj-family').replace(/[^a-zA-Z0-9_-]/g,'-')}/fitness/${String(assetId||'').replace(/[^a-zA-Z0-9_-]/g,'')}.png`
export const fitnessImageJobKey=(householdId,jobId)=>`${String(householdId||'lslj-family').replace(/[^a-zA-Z0-9_-]/g,'-')}/fitness-jobs/${String(jobId||'').replace(/[^a-zA-Z0-9_-]/g,'')}.json`
export const familyFitnessReference=member=>{
  const number=MEMBER_NUMBER[member]
  return number?{member,fileName:`${member.toLowerCase()}-identity.jpg`,mimeType:'image/jpeg',url:new URL(`../assets/sermon-characters/approved-character-${number}.jpg`,import.meta.url)}:null
}
export function buildFitnessImagePrompt(exercise,member){return `Use the attached photograph only as the facial and personal identity reference for ${member}. Create a premium ultra-photorealistic Men's Health / Women's Health editorial fitness photograph of this same recognizable person performing ${exercise.name} with anatomically correct, safe exercise form. Exercise cue: ${exercise.cue}. Clearly show the complete body, the full exercise position, all limbs, the relevant equipment, and enough surrounding space to understand the movement. Do not crop the head, hands, feet, weights, bench, cable attachment, or machine. Landscape 4:3 composition, subject centered, luxury black-and-antique-gold gym, realistic athletic physique appropriate to the person's age, natural skin texture, cinematic but instructional lighting. Preserve identity; do not copy the reference pose, clothing, background, crop, or expression. No text, logos, labels, watermarks, collage, split screen, extra people, malformed anatomy, or duplicated limbs.`}
export async function generateFitnessImage({exercise,member,assetId,householdId='lslj-family',store,fetcher=fetch}){
  if(!process.env.OPENAI_API_KEY&&fetcher===fetch)throw Object.assign(new Error('Fitness image generation is not configured.'),{code:'IMAGE_GENERATION_ERROR'})
  const reference=familyFitnessReference(member);if(!reference)throw Object.assign(new Error('Choose an approved household member for the exercise image.'),{code:'VALIDATION_ERROR'})
  const bytes=await readFile(reference.url),form=new FormData();form.append('model',process.env.BREVITY_IMAGE_MODEL||'gpt-image-2');form.append('prompt',buildFitnessImagePrompt(exercise,member));form.append('size','1536x1024');form.append('quality','medium');form.append('output_format','png');form.append('image[]',new Blob([bytes],{type:reference.mimeType}),reference.fileName)
  const response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form}),payload=await response.json().catch(()=>({}))
  if(!response.ok)throw Object.assign(new Error(payload.error?.message||`Fitness image generation returned ${response.status}.`),{code:'IMAGE_GENERATION_ERROR'})
  const encoded=payload.data?.[0]?.b64_json;if(!encoded)throw Object.assign(new Error('Fitness image generation returned no image.'),{code:'IMAGE_GENERATION_ERROR'})
  const output=Buffer.from(encoded,'base64');if(output.length<8||output[0]!==0x89||output[1]!==0x50)throw Object.assign(new Error('Fitness image generation returned an unsupported file.'),{code:'IMAGE_GENERATION_ERROR'})
  await store.set(fitnessImageKey(householdId,assetId),output)
  return `/.netlify/functions/fitness-images?id=${encodeURIComponent(assetId)}`
}

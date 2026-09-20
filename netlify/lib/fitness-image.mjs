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
const MOVEMENT_DETAILS=Object.freeze({
  'pec-deck':'Seated at an actual pec-deck machine, back supported, bringing the machine handles or forearm pads together in front of the chest. Show the machine arms and seat. Not a standing cable fly.',
  'single-cable-press':'Standing in a stable split stance, pressing ONE D-handle forward from chest level with ONE working arm. The pulley is behind the working side. The free hand does not hold a second cable. Not a two-arm fly.',
  'cable-press-around':'Perform a single-arm cable press-around: the working upper arm sweeps across the rib cage against the cable, with the hips stable. The view must reveal the across-body movement, not a symmetrical two-handle fly.',
  'landmine-press':'Half-kneeling with ONE knee on the floor and the opposite foot planted. Press the free end of an anchored, angled barbell upward and forward. Show the barbell and its fixed landmine anchor. No seated bench and no overhead dumbbells.',
  'assisted-dip':'Use an assisted dip machine with hands on parallel dip handles beside the torso and knees or feet on the assistance platform. Show the assistance mechanism and the slight forward torso lean during the dip. Not a floor push-up.',
  'decline-push-up':'Hands on the floor and BOTH FEET ELEVATED on a stable bench or platform, maintaining a straight body line. The elevated support must be fully visible. Not a flat-floor push-up.',
  'close-push-up':'Hands narrowly spaced, approximately just inside shoulder width, and elbows close to the torso during the push-up. Show the hand spacing clearly. Not a wide-hand push-up with flared elbows.',
  'push-up':'Hands on the floor, feet on the floor, and a straight trunk. Keep the head aligned with the spine and gaze toward the floor slightly ahead of the hands, not lifted toward the photographer.',
  'lat-pulldown':'Seated at the lat-pulldown station, pulling the overhead attachment in front of the body. Keep the head aligned naturally; do not turn the head over the shoulder toward the camera.',
})
export function buildFitnessImagePrompt(exercise,member){
  if(!exercise?.id||!exercise?.name)throw new Error('An exact exercise ID and name are required for an exercise image.')
  const equipment=exercise.equipment&&exercise.equipment!=='Other'?`Required equipment category: ${exercise.equipment}.`:''
  return `Use the attached photograph only as the facial and personal identity reference for ${member}. Create one ultra-photorealistic documentary exercise-demonstration photograph of this same recognizable person actively performing the EXACT exercise: ${exercise.name} (exercise ID: ${exercise.id}). ${equipment}
Exercise cue: ${exercise.cue||''}. ${MOVEMENT_DETAILS[exercise.id]||''}
MOVEMENT ACCURACY: Show the specific movement, equipment, stance, grip, bench angle, support points, and unilateral or bilateral variation named above. Do not substitute a related movement just because it trains the same muscles. Show anatomically plausible exercise form at a clearly readable moment in a real repetition.
NATURAL PERFORMANCE: The person is absorbed in training and unaware of the photographer, with a natural expression of concentration or effort. No eye contact with the camera. No camera-facing portrait pose, posed smile, or head turn toward the photographer. Gaze follows the exercise naturally while the head and neck remain appropriately aligned with the torso; do not force the person to look at a weight when that would distort their posture. Choose a side or three-quarter camera angle that makes the technique and equipment clear without making the person turn toward the lens.
Clearly show the complete body, the full exercise position, all limbs, relevant equipment, and enough surrounding space to understand the movement. Do not crop the head, hands, feet, weights, bench, cable attachment, or machine. Landscape 4:3 composition, luxury black-and-antique-gold gym, realistic athletic physique appropriate to the person's age, natural skin texture, clear instructional lighting. Preserve identity; do not copy the reference pose, gaze, head angle, clothing, background, crop, or expression. This is an instructional action photograph, not a magazine-cover portrait. No text, logos, labels, watermarks, collage, split screen, extra people, malformed anatomy, or duplicated limbs.`
}
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

export const FITNESS_IMAGE_STORE='brevity-fitness-images'
export const FITNESS_IMAGE_JOB_STORE='brevity-fitness-image-jobs'
const MEMBER_REFERENCES=Object.freeze({
  Larry:[['larry.jpg','BREVITY_FITNESS_IDENTITY_LARRY_BASE64']],
  Lorenzo:[['lorenzo.jpg','BREVITY_FITNESS_IDENTITY_LORENZO_BASE64']],
  Isaiah:[['isaiah.jpg','BREVITY_FITNESS_IDENTITY_ISAIAH_BASE64']],
  Nyla:[['nyla.jpg','BREVITY_FITNESS_IDENTITY_NYLA_BASE64']],
  Javin:[['javin.jpg','BREVITY_FITNESS_IDENTITY_JAVIN_BASE64']],
  Terica:[['terica-face.jpg','BREVITY_FITNESS_IDENTITY_TERICA_FACE_BASE64'],['terica-hair.jpg','BREVITY_FITNESS_IDENTITY_TERICA_HAIR_BASE64']],
})
export const fitnessImageKey=(householdId,assetId)=>`${String(householdId||'lslj-family').replace(/[^a-zA-Z0-9_-]/g,'-')}/fitness/${String(assetId||'').replace(/[^a-zA-Z0-9_-]/g,'')}.png`
export const fitnessImageJobKey=(householdId,jobId)=>`${String(householdId||'lslj-family').replace(/[^a-zA-Z0-9_-]/g,'-')}/fitness-jobs/${String(jobId||'').replace(/[^a-zA-Z0-9_-]/g,'')}.json`
export const familyFitnessReference=member=>{
  const definitions=MEMBER_REFERENCES[member]
  if(!definitions)return null
  const references=definitions.map(([fileName,envVar])=>({fileName,mimeType:'image/jpeg',envVar}))
  return {member,...references[0],references}
}
const privateReferenceBytes=(reference,environment=process.env)=>{
  const encoded=String(environment[reference.envVar]||'').trim()
  if(!encoded)throw Object.assign(new Error(`The private fitness identity reference for ${reference.fileName} is not configured.`),{code:'IMAGE_GENERATION_ERROR'})
  const bytes=Buffer.from(encoded,'base64')
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)throw Object.assign(new Error(`The private fitness identity reference for ${reference.fileName} is invalid.`),{code:'IMAGE_GENERATION_ERROR'})
  return bytes
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
  'stair-climber':'Show a mechanically coherent rotating-stair machine. In side view, the steps and person travel from right to left, ascending toward and facing the console at the left/front end.',
  'ski-erg':'Show an actual dual-cord SkiErg. Each hand grips one handle, and each handle has its own continuous, taut cord running directly to the matching upper pulley. At both hands, show an unmistakable cord-to-connector-eyelet-to-handle chain outside the fist; no cord may disappear at a wrist or pass beside a handle. No floating, broken, missing, crossed, or handle-bypassing cord.',
  'brisk-walk':'Show the person walking forward inside one marked track lane. Feet, stride, hips, shoulders, and gaze must follow the lane tangent around the curve; do not step sideways, cross a lane border, or cut across the track.',
})
export function buildFitnessImagePrompt(exercise,member){
  if(!exercise?.id||!exercise?.name)throw new Error('An exact exercise ID and name are required for an exercise image.')
  const equipment=exercise.equipment&&exercise.equipment!=='Other'?`Required equipment category: ${exercise.equipment}.`:''
  return `Use the attached photograph only as the facial and personal identity reference for ${member}. Create one ultra-photorealistic documentary exercise-demonstration photograph of this same recognizable person actively performing the EXACT exercise: ${exercise.name} (exercise ID: ${exercise.id}). ${equipment}
Exercise cue: ${exercise.cue||''}. ${MOVEMENT_DETAILS[exercise.id]||''}
MOVEMENT ACCURACY: Show the specific movement, equipment, stance, grip, bench angle, support points, and unilateral or bilateral variation named above. Do not substitute a related movement just because it trains the same muscles. Show anatomically plausible exercise form at a clearly readable moment in a real repetition.
NATURAL PERFORMANCE: The person is absorbed in training and unaware of the photographer, with a natural expression of concentration or effort. No eye contact with the camera. No camera-facing portrait pose, posed smile, or head turn toward the photographer. Gaze follows the exercise naturally while the head and neck remain appropriately aligned with the torso; do not force the person to look at a weight when that would distort their posture. Choose a side or three-quarter camera angle that makes the technique and equipment clear without making the person turn toward the lens.
Clearly show the complete body, the full exercise position, all limbs, relevant equipment, and enough surrounding space to understand the movement. Do not crop the head, hands, feet, weights, bench, cable attachment, or machine. Landscape 4:3 composition, luxury black-and-antique-gold gym, realistic athletic physique appropriate to the person's age, natural skin texture, clear instructional lighting. Preserve identity; do not copy the reference pose, gaze, head angle, clothing, background, crop, or expression. This is an instructional action photograph, not a magazine-cover portrait. Wardrobe requirement: absolutely no visible socks or exposed sock fabric; use true no-show socks fully concealed inside low-top trainers with bare ankles, or leggings meeting the shoe collars. No text, logos, labels, watermarks, collage, split screen, extra people, malformed anatomy, or duplicated limbs.`
}
export async function generateFitnessImage({exercise,member,assetId,householdId='lslj-family',store,fetcher=fetch,environment=process.env}){
  if(!process.env.OPENAI_API_KEY&&fetcher===fetch)throw Object.assign(new Error('Fitness image generation is not configured.'),{code:'IMAGE_GENERATION_ERROR'})
  const reference=familyFitnessReference(member);if(!reference)throw Object.assign(new Error('Choose an approved household member for the exercise image.'),{code:'VALIDATION_ERROR'})
  const form=new FormData();form.append('model',process.env.BREVITY_IMAGE_MODEL||'gpt-image-2');form.append('prompt',buildFitnessImagePrompt(exercise,member));form.append('size','1536x1024');form.append('quality','medium');form.append('output_format','png')
  for(const item of reference.references){const bytes=privateReferenceBytes(item,environment);form.append('image[]',new Blob([bytes],{type:item.mimeType}),item.fileName)}
  const response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form}),payload=await response.json().catch(()=>({}))
  if(!response.ok)throw Object.assign(new Error(payload.error?.message||`Fitness image generation returned ${response.status}.`),{code:'IMAGE_GENERATION_ERROR'})
  const encoded=payload.data?.[0]?.b64_json;if(!encoded)throw Object.assign(new Error('Fitness image generation returned no image.'),{code:'IMAGE_GENERATION_ERROR'})
  const output=Buffer.from(encoded,'base64');if(output.length<8||output[0]!==0x89||output[1]!==0x50)throw Object.assign(new Error('Fitness image generation returned an unsupported file.'),{code:'IMAGE_GENERATION_ERROR'})
  await store.set(fitnessImageKey(householdId,assetId),output)
  return `/.netlify/functions/fitness-images?id=${encodeURIComponent(assetId)}`
}

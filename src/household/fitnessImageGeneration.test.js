import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildFitnessImagePrompt, FITNESS_MEMBER_REFERENCES, fitnessImageKey, generateFitnessImage, validateFitnessImageRequest } from '../../netlify/lib/fitness-image.mjs'
import { createFitnessImageBackgroundHandler } from '../../netlify/functions/fitness-image-generate-background.mjs'

test('fitness identity references follow the approved household mapping',()=>{
  assert.deepEqual(Object.keys(FITNESS_MEMBER_REFERENCES),['Larry','Lorenzo','Isaiah','Nyla','Javin','Terica'])
  assert.deepEqual(FITNESS_MEMBER_REFERENCES.Terica.map(item=>item.role),['facial identity lock','hairstyle reference'])
  assert.match(FITNESS_MEMBER_REFERENCES.Terica[0].fileName,/terica-face/)
  assert.match(FITNESS_MEMBER_REFERENCES.Terica[1].fileName,/terica-hair/)
})

test('fitness prompts preserve identity, teach the exercise, and keep Isaiah youth-safe',()=>{
  const adult=buildFitnessImagePrompt({member:'Larry',exerciseId:'lat-pulldown'})
  assert.match(adult,/preserve this person’s recognizable face/i)
  assert.match(adult,/Wide-neutral lat pulldown/)
  assert.match(adult,/safe form/)
  const youth=buildFitnessImagePrompt({member:'Isaiah',exerciseId:'goblet-squat'})
  assert.match(youth,/subject is a child/i)
  assert.match(youth,/adult-supervised technique/i)
  assert.match(youth,/non-bodybuilding/i)
  const terica=buildFitnessImagePrompt({member:'Terica',exerciseId:'hip-thrust'})
  assert.match(terica,/Image 1 is the facial identity lock/)
  assert.match(terica,/Image 2 is the hairstyle reference/)
})

test('fitness generation uses authenticated image edits and stores a member-specific PNG',async()=>{
  const previousKey=process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY='test-key'
  let stored,request
  const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1])
  const image=await generateFitnessImage({member:'Terica',exerciseId:'plank',householdId:'family',store:{set:async(key,value)=>{stored={key,value}}},fetcher:async(url,options)=>{
    request={url,options,images:options.body.getAll('image[]')}
    return{ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]})}
  }})
  assert.equal(request.url,'https://api.openai.com/v1/images/edits')
  assert.equal(request.images.length,2)
  assert.equal(stored.key,fitnessImageKey('family','Terica','plank'))
  assert.ok(image.includes('member=Terica'))
  if(previousKey===undefined)delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY=previousKey
})

test('fitness background generation requires a session and rejects unknown members',async()=>{
  const anonymous=createFitnessImageBackgroundHandler({readSessionFn:async()=>null})
  assert.equal((await anonymous(new Request('https://example.test',{method:'POST'}))).status,401)
  const handler=createFitnessImageBackgroundHandler({readSessionFn:async()=>({member:'Larry'}),jobStore:{setJSON:async()=>{}},imageStore:{},generateImage:async()=>''})
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:'job-1',member:'Unknown',exerciseIds:['plank']})}))
  assert.equal(response.status,400)
  assert.throws(()=>validateFitnessImageRequest('Larry',['unknown']),/household library/)
})

test('fitness views request member-specific images and retain generic fallbacks',async()=>{
  const image=await readFile(new URL('../fitness/MemberExerciseImage.jsx',import.meta.url),'utf8')
  const workout=await readFile(new URL('../fitness/DailyFitnessWorkout.jsx',import.meta.url),'utf8')
  const today=await readFile(new URL('./TodayDashboard.jsx',import.meta.url),'utf8')
  assert.match(image,/memberExerciseImageUrl\(member,exercise\.id/)
  assert.match(image,/setSource\(exercise\.image\)/)
  assert.match(workout,/Create \$\{currentMember\}’s Workout Photos/)
  assert.match(workout,/generateWorkoutImages\(currentMember/)
  assert.match(today,/MemberExerciseImage member=\{currentMember\}/)
})

test('approved family references are bundled only with the authenticated background worker',async()=>{
  const config=await readFile(new URL('../../netlify.toml',import.meta.url),'utf8')
  assert.match(config,/\[functions\."fitness-image-generate-background"\][\s\S]*included_files = \["netlify\/assets\/fitness-members\/\*\*"\]/)
})

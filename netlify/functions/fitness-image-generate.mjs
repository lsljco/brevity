import { randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { EXERCISE_BY_ID } from '../../src/fitness/fitnessWorkoutPlan.js'
import { FITNESS_IMAGE_JOB_STORE, FITNESS_IMAGE_STORE, fitnessImageJobKey, generateFitnessImage } from '../lib/fitness-image.mjs'

const {readSession}=householdAuth,householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}}),safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,180)
export function createFitnessImageHandler({readSessionFn=readSession,imageStore=null,jobStore=null,generateImage=generateFitnessImage,now=()=>new Date()}={}){return async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSessionFn({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return json(401,{error:'Sign in to generate a fitness image.'})
  const body=await request.json().catch(()=>({})),jobId=safe(body.jobId),exercise=EXERCISE_BY_ID[String(body.exerciseId||'')],member=String(body.member||'')
  if(!jobId||!exercise||!['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah'].includes(member))return json(400,{error:'Choose a valid exercise, approved household member, and image job.'})
  const jobs=jobStore||getStore({name:FITNESS_IMAGE_JOB_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),images=imageStore||getStore({name:FITNESS_IMAGE_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),key=fitnessImageJobKey(householdId,jobId)
  try{await jobs.setJSON(key,{state:'generating',jobId,exerciseId:exercise.id,member,startedAt:now().toISOString(),startedBy:session.member||'Household member'});const assetId=`${exercise.id}-${member.toLowerCase()}-${randomUUID()}`,image=await generateImage({exercise,member,assetId,householdId,store:images});await jobs.setJSON(key,{state:'ready',jobId,exerciseId:exercise.id,member,image,updatedAt:now().toISOString()})}catch(error){console.error('[fitness-image-generate]',error);await jobs.setJSON(key,{state:'error',jobId,exerciseId:exercise?.id,member,error:error.message||'Brevity could not generate the fitness image.',updatedAt:now().toISOString()}).catch(()=>{})}
  return json(202,{accepted:true,jobId})
}}
export default createFitnessImageHandler()
export const config={background:true,path:'/.netlify/functions/fitness-image-generate'}

import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { FITNESS_IMAGE_JOB_STORE, fitnessImageJobKey } from '../lib/fitness-image.mjs'

const {readSession}=householdAuth,householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,180)
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
export default async function handler(request){
  const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return json(401,{error:'Sign in to check fitness-image generation.'})
  const jobId=safe(new URL(request.url).searchParams.get('jobId'));if(!jobId)return json(400,{error:'A valid fitness-image job is required.'})
  const store=getStore({name:FITNESS_IMAGE_JOB_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),job=await store.get(fitnessImageJobKey(householdId,jobId),{type:'json'}).catch(()=>null)
  return json(200,job||{state:'pending',jobId})
}
export const config={path:'/.netlify/functions/fitness-image-job-status'}

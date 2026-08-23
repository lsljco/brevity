import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'

const {readSession}=householdAuth
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const STORE_NAME='brevity-household'
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})

export default async function handler(request){
  const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to check sermon analysis.'})
  const jobId=new URL(request.url).searchParams.get('jobId')||''
  if(!/^[a-zA-Z0-9-]{20,80}$/.test(jobId))return json(400,{error:'A valid sermon analysis job is required.'})
  const job=await store().get(`${HOUSEHOLD_ID}/sermon-jobs/${jobId}`,{type:'json'}).catch(()=>null)
  return json(200,job||{state:'pending'})
}

export const config={path:'/.netlify/functions/sermon-formation-status'}

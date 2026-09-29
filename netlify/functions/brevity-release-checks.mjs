import {readBackgroundJob} from '../lib/background-job-state.mjs'
import {getStore} from '../lib/scoped-store.cjs'
import {randomUUID} from 'node:crypto'
import householdAuth from './household-auth.js'
import {releaseCheckAccess,releaseBuild} from '../lib/release-check-access.mjs'
import {evaluationCases} from '../lib/household-agent-evaluation.mjs'
export const releaseJobs=()=>getStore({name:'brevity-release-checks',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
export const handler=async event=>{
 const session=await householdAuth.readSession(event).catch(()=>null),denied=releaseCheckAccess(session)
 if(denied){const cookieHeader=event.headers?.cookie||event.headers?.Cookie||'';const hasCookie=cookieHeader.split(';').some(part=>part.trim().startsWith('brevity_household_session='));return json(denied.status,{error:denied.status===401?`${denied.error} ${hasCookie?'A session cookie was received but could not be verified.':'The request did not include a session cookie.'}`:denied.error})}
 if(event.httpMethod==='GET'){
  const id=event.queryStringParameters?.id
  if(!id)return json(200,{build:releaseBuild,cases:evaluationCases.map(({id,review})=>({id,review}))})
  if(!/^[a-f0-9-]{36}$/.test(id))return json(400,{error:'Invalid run.'})
  const job=await readBackgroundJob(releaseJobs(),id)
  if(!job||job.owner!==session.member)return json(404,{error:'Run not found.'})
  return json(200,job)
 }
 if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
 const ids=body.persistenceOnly===true?[]:body.caseIds||evaluationCases.map(item=>item.id)
 if(!Array.isArray(ids)||(!ids.length&&body.persistenceOnly!==true)||ids.length>50||ids.some(id=>!evaluationCases.some(item=>item.id===id)))return json(400,{error:'Choose known evaluation cases.'})
 const host=event.headers?.host||'',origin=event.headers?.origin
 if(!/^deploy-preview-\d+--brevityoflife\.netlify\.app$/.test(host)||origin&&origin!==`https://${host}`)return json(403,{error:'Use this deploy preview directly.'})
 const id=randomUUID(),job={id,owner:session.member,state:'queued',createdAt:new Date().toISOString(),build:releaseBuild,caseIds:[...new Set(ids)],syntheticData:true,productionWrites:false,results:[]}
 const store=releaseJobs(),leaseKey=`active:${session.member}`,previous=await store.getWithMetadata(leaseKey,{type:'json'})
 if(previous?.data?.id&&Date.now()-previous.data.startedAt<15*60*1000){
  const active=await readBackgroundJob(store,previous.data.id)
  if(active&&['queued','running'].includes(active.state))return json(409,{error:'A release check is already running.',id:active.id})
 }
 const lease=await store.setJSON(leaseKey,{id,startedAt:Date.now()},previous?.etag?{onlyIfMatch:previous.etag}:{onlyIfNew:true})
 if(lease?.modified===false)return json(409,{error:'A release check was just started. Refresh to check its progress.'})
 await store.setJSON(id,job,{onlyIfNew:true})
 const response=await fetch(`https://${host}/.netlify/functions/brevity-release-checks-background`,{method:'POST',headers:{'content-type':'application/json',cookie:event.headers.cookie||''},body:JSON.stringify({id})})
 if(!response.ok){await store.setJSON(id,{...job,state:'failed',error:'Could not start release checks.'});return json(502,{error:'Could not start release checks.'})}
 return json(202,{id})
}

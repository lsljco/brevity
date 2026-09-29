import {getStore} from '@netlify/blobs'
import {verifyReleasePersistence} from '../lib/release-persistence-checks.mjs'
import householdAuth from './household-auth.js'
import {releaseCheckAccess} from '../lib/release-check-access.mjs'
import {evaluationCases,evaluateHouseholdCase} from '../lib/household-agent-evaluation.mjs'
import {releaseJobs} from './brevity-release-checks.mjs'
export default async request=>{
 const session=await householdAuth.readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null),denied=releaseCheckAccess(session)
 if(denied)return new Response(denied.error,{status:denied.status})
 const {id}=await request.json().catch(()=>({}))
 if(!/^[a-f0-9-]{36}$/.test(id||''))return new Response('Invalid run',{status:400})
 const store=releaseJobs(),entry=await store.getWithMetadata(id,{type:'json'}),job=entry?.data
 if(!job||job.owner!==session.member)return new Response('Not found',{status:404})
 if(job.state!=='queued')return new Response(null,{status:202})
 const claimed=await store.setJSON(id,{...job,state:'running'},{onlyIfMatch:entry.etag})
 if(claimed?.modified===false)return new Response(null,{status:202})
 const results=[]
 let persistence=null
 try{
  persistence=await verifyReleasePersistence({store:getStore({name:'brevity-release-fixtures',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),runId:id}).catch(error=>({passed:false,error:error.message}))
  for(let index=0;index<job.caseIds.length;index+=3){
   results.push(...await Promise.all(job.caseIds.slice(index,index+3).map(id=>evaluateHouseholdCase(evaluationCases.find(item=>item.id===id)))))
   await store.setJSON(id,{...job,state:'running',results,persistence})
  }
  await store.setJSON(id,{...job,state:'complete',completedAt:new Date().toISOString(),results,persistence})
 }catch{await store.setJSON(id,{...job,state:'failed',results,persistence,error:'Release check execution failed.'})}
 return new Response(null,{status:202})
}
export const config={background:true,path:'/.netlify/functions/brevity-release-checks-background'}

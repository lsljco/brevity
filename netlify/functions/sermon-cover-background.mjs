import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { workspaceKey,safeId } from '../lib/sermon-workspace-package.mjs'
import { COVER_STORE,COVER_JOB_STORE,coverJobKey,coverSourceHash,generateSermonCover } from '../lib/sermon-cover.mjs'

const {readSession}=householdAuth
const householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
const store=name=>getStore({name,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export function createSermonCoverBackgroundHandler({authenticate=readSession,repository=null,jobStore=null,imageStore=null,generateImage=generateSermonCover,now=()=>new Date()}={}){
 return async request=>{
  const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
  if(!session?.member)return json(401,{error:'Sign in to generate a sermon cover.'})
  const {sermonId,jobId}=await request.json().catch(()=>({}))
  if(!safeId(sermonId)||!safeId(jobId))return json(400,{error:'Invalid cover job.'})
  const jobs=jobStore||store(COVER_JOB_STORE),data=repository||store('brevity-sermon-repository'),key=coverJobKey(householdId,sermonId)
  const status=await jobs.get(key,{type:'json'})
  if(!status||status.id!==jobId||status.requestedBy!==session.member)return json(404,{error:'Cover job not found.'})
  if(status.state==='ready'||status.state==='generating')return json(202,{accepted:true,jobId})
  const sermon=(await data.get(workspaceKey,{type:'json'}))?.sermons?.find(item=>item.id===sermonId)
  if(!sermon||coverSourceHash(sermon)!==status.sourceHash){await jobs.setJSON(key,{...status,state:'error',error:'The sermon changed before cover generation started.',updatedAt:now().toISOString()});return json(409,{error:'The sermon changed before cover generation started.'})}
  await jobs.setJSON(key,{...status,state:'generating',updatedAt:now().toISOString()})
  try{
   const image=await generateImage({sermon,assetId:status.assetId,householdId,store:imageStore||store(COVER_STORE)})
   const latest=await jobs.get(key,{type:'json'})
   if(latest?.id===jobId)await jobs.setJSON(key,{...status,state:'ready',image,updatedAt:now().toISOString()})
  }catch(error){console.error('[sermon-cover-background]',error);const latest=await jobs.get(key,{type:'json'});if(latest?.id===jobId)await jobs.setJSON(key,{...status,state:'error',error:error.message||'Could not generate the cover.',updatedAt:now().toISOString()})}
  return json(202,{accepted:true,jobId})
 }
}
export default createSermonCoverBackgroundHandler()
export const config={background:true,path:'/.netlify/functions/sermon-cover-background'}

import {recordUsage} from '../lib/usage-metrics.mjs'
import { getStore } from '../lib/scoped-store.mjs'
import householdAuth from '../lib/household-auth.cjs'
import { processAssistantRequest } from './brevity-assistant.mjs'

const jobs=()=>getStore({name:'brevity-assistant-jobs',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
export default async request=>{
  const session=await householdAuth.readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to use Brevity Assistant.'})
  const {id}=await request.json().catch(()=>({}))
  if(!/^[0-9a-f-]{36}$/.test(id||''))return json(400,{error:'Invalid assistant job.'})
  const store=jobs(),key=`job-${id}`,entry=await store.getWithMetadata(key,{type:'json'}),status=entry?.data
  if(!status||status.member!==session.member)return json(404,{error:'Assistant job not found.'})
  if(status.state!=='queued')return json(202,{accepted:true})
  const claimed=await store.setJSON(key,{member:status.member,state:'processing',createdAt:status.createdAt},{onlyIfMatch:entry.etag})
  if(claimed?.modified===false)return json(202,{accepted:true})
  const started=Date.now()
  try{
    const result=await processAssistantRequest({httpMethod:'POST',requestId:id,headers:{host:new URL(request.url).host,cookie:request.headers.get('cookie')||''},body:JSON.stringify(status.body)})
    const payload=JSON.parse(result.body),outcome=result.statusCode===200?(payload._usage?.outcome||'answered'):'failed';delete payload._usage
    await store.setJSON(key,{member:status.member,state:'ready',createdAt:status.createdAt,statusCode:result.statusCode,result:payload})
    await recordUsage(session.member,{id,kind:'assistant',outcome,durationMs:Date.now()-started})
  }catch(error){await recordUsage(session.member,{id,kind:'assistant',outcome:'failed',durationMs:Date.now()-started});console.error('[brevity-assistant-background]',error);await store.setJSON(key,{member:status.member,state:'error',createdAt:status.createdAt,statusCode:502,result:{error:'Brevity Assistant could not complete this request. Please retry.'}})}
  return json(202,{accepted:true})
}
export const config={background:true,path:'/.netlify/functions/brevity-assistant-background'}

import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { processAssistantRequest } from './brevity-assistant.mjs'

const jobs=()=>getStore({name:'brevity-assistant-jobs',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
export default async request=>{
  const session=await householdAuth.readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to use Brevity Assistant.'})
  const {id}=await request.json().catch(()=>({}))
  if(!/^[0-9a-f-]{36}$/.test(id||''))return json(400,{error:'Invalid assistant job.'})
  const store=jobs(),key=`job-${id}`,status=await store.get(key,{type:'json'})
  if(!status||status.member!==session.member)return json(404,{error:'Assistant job not found.'})
  if(status.state!=='queued')return json(202,{accepted:true})
  await store.setJSON(key,{member:status.member,state:'processing',createdAt:status.createdAt})
  try{
    const result=await processAssistantRequest({httpMethod:'POST',requestId:id,headers:{host:new URL(request.url).host,cookie:request.headers.get('cookie')||''},body:JSON.stringify(status.body)})
    await store.setJSON(key,{member:status.member,state:'ready',createdAt:status.createdAt,statusCode:result.statusCode,result:JSON.parse(result.body)})
  }catch(error){console.error('[brevity-assistant-background]',error);await store.setJSON(key,{member:status.member,state:'error',createdAt:status.createdAt,statusCode:502,result:{error:'Brevity Assistant could not complete this request. Please retry.'}})}
  return json(202,{accepted:true})
}
export const config={background:true,path:'/.netlify/functions/brevity-assistant-background'}

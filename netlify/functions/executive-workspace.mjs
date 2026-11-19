import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import auth from '../lib/household-auth.cjs'
import {loadProductionAuthoritativeAssistantContext} from '../lib/assistant-authoritative-context.mjs'
import {EXECUTIVE_ROLES,EXECUTIVE_NOTICE} from '../../src/executives/model.js'
import {requireExecutiveAdmin,requireExecutive,executiveContext,productionExecutiveRepository} from '../lib/executive-workspace.mjs'
const json=(statusCode,value)=>({statusCode,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:JSON.stringify(value)})
export function createExecutiveHandler({authenticate=auth.readSession,repository=productionExecutiveRepository,loadContext=loadProductionAuthoritativeAssistantContext}={}){return async event=>{
 try{
  const session=await authenticate(event).catch(()=>null);requireExecutiveAdmin(session)
  if(event.httpMethod==='GET'){
   const {role='bruce',view='queue',id}=event.queryStringParameters||{};requireExecutive(role)
   if(view==='context')return json(200,executiveContext(role,await loadContext({member:session.member,role:session.role})))
   if(view!=='queue')return json(400,{error:'Unknown executive view.'})
   const repo=repository()
   return json(200,{roles:EXECUTIVE_ROLES,notice:EXECUTIVE_NOTICE,workerEnabled:false,...(id?{row:await repo.get(id,role)}:await repo.list(role))})
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([key,value])=>[key.toLowerCase(),value]))
  // JSON plus a custom header prevents cross-site form submissions with cookies.
  if(!String(headers['content-type']||'').startsWith('application/json')||headers['x-brevity-executive']!=='1')return json(403,{error:'Use the executive workspace to save changes.'})
  if((event.body||'').length>10000)return json(413,{error:'Request too large.'})
  let input;try{input=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
  if(!input||Array.isArray(input)||input.member!==session.member)return json(409,{error:'The signed-in member changed. Refresh before saving.'})
  const repo=repository()
  if(input.action==='create')return json(200,await repo.create(input,session))
  if(input.action==='progress')return json(200,await repo.change(input,session))
  return json(400,{error:'Unsupported executive action.'})
 }catch(error){return json(error.status||503,{error:error.status?error.message:'Executive sources are unavailable. Retry before relying on this view.'})}
}}
export default withLambda(createExecutiveHandler())

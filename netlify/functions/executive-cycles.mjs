import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import auth from '../lib/household-auth.cjs'
import {requireExecutiveAdmin} from '../lib/executive-workspace.mjs'
import {productionExecutiveRuns,executiveReadiness,dispatchExecutiveCycle} from '../lib/executive-runs.mjs'
const json=(statusCode,data)=>({statusCode,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:JSON.stringify(data)})
export function createExecutiveCyclesHandler({authenticate=auth.readSession,repository=productionExecutiveRuns,readiness=executiveReadiness,dispatch=dispatchExecutiveCycle}={}){return async event=>{
 try{
  const session=await authenticate(event).catch(()=>null);requireExecutiveAdmin(session)
  const repo=repository()
  if(event.httpMethod==='GET')return json(200,{...(await repo.list()),config:await repo.config(),runtime:readiness()})
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const h=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]))
  if(!String(h['content-type']||'').startsWith('application/json')||h['x-brevity-executive']!=='1')return json(403,{error:'Use the executive workspace to save changes.'})
  if((event.body||'').length>6000)return json(413,{error:'Request too large.'})
  let input;try{input=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
  if(!input||Array.isArray(input)||input.member!==session.member)return json(409,{error:'Signed-in member changed. Refresh first.'})
  if(input.action==='configure'){
   if(input.enabled&&!readiness().ready)return json(503,{error:'Executive runtime configuration is unavailable.'})
   return json(200,{config:await repo.configure(input,session.member)})
  }
  if(input.action==='start'){
   if(!readiness().ready)return json(503,{error:'Executive runtime configuration is unavailable.'})
   const result=await repo.create({id:input.id,goal:input.goal,member:session.member})
   if(result.run.status==='queued')return json(202,{...result,dispatch:await dispatch(result.run.id)})
   return json(200,result)
  }
  if(input.action==='dispatch'){
   const run=await repo.get(input.id);if(run.status!=='queued')return json(409,{error:'Only a queued cycle can be dispatched.'})
   return json(202,await dispatch(run.id))
  }
  if(input.action==='cancel')return json(200,{run:await repo.cancel(input.id,session.member)})
  if(input.action==='decide')return json(200,{run:await repo.decide(input.id,input,session.member)})
  return json(400,{error:'Unsupported cycle action.'})
 }catch(error){return json(error.status||503,{error:error.status?error.message:'Executive cycles are unavailable. No source action was authorized.'})}
}}
export default withLambda(createExecutiveCyclesHandler())

import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {productionUsageRepository} from '../lib/usage-metrics.mjs'
import {HOUSEHOLD_MEMBERS} from '../lib/assistant-action-contract.mjs'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
export const createUsageHandler=({readSession=householdAuth.readSession,repository=productionUsageRepository}={})=>async event=>{
 const session=await readSession(event).catch(()=>null)
 if(!session)return json(401,{error:'Sign in to view usage.'})
 try{
  const repo=repository()
  if(event.httpMethod==='POST'){
   const body=JSON.parse(event.body||'{}')
   if(!['helpful','friction'].includes(body.outcome)||!/^feedback-[a-f0-9-]{36}$/.test(body.id||''))return json(400,{error:'Choose helpful or needs improvement.'})
   await repo.record(session.member,{id:body.id,kind:'feedback',outcome:body.outcome})
   return json(200,{recorded:true})
  }
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'})
  const members=session.role==='admin'&&['Larry','Lorenzo'].includes(session.member)?HOUSEHOLD_MEMBERS:[session.member]
  return json(200,await repo.summary(members))
 }catch{return json(503,{error:'Usage measurements are temporarily unavailable.'})}
}
export const handler=createUsageHandler()

export default withLambda(handler)

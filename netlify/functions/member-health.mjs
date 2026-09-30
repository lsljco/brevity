import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import auth from '../lib/household-auth.cjs'
import {HEALTH_MEMBERS,productionHealthRepository,healthSettings,applyHealthSnapshot,healthSummary,sharedHealthSummary} from '../lib/member-health.mjs'
export function createMemberHealthHandler({readSession=auth.readSession,repository,now=()=>new Date()}={}){
 return async event=>{
  const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
  const session=await readSession(event).catch(()=>null)
  if(!session)return reply(401,{error:'Sign in to your own Brevity account.'})
  try{
   const repo=repository||productionHealthRepository(),action=event.queryStringParameters?.action||'summary'
   if(event.httpMethod==='GET'){
    if(action==='household'){
     const results=await Promise.allSettled(HEALTH_MEMBERS.map(async member=>sharedHealthSummary((await repo.read(member)).value,member,now())))
     return reply(200,{summaries:results.filter(row=>row.status==='fulfilled'&&row.value).map(row=>row.value),unavailable:results.some(row=>row.status==='rejected')})
    }
    if(action!=='summary')return reply(400,{error:'Unknown health view.'})
    return reply(200,healthSummary((await repo.read(session.member)).value,session.member,now()))
   }
   if(event.httpMethod!=='POST'||!['settings','sync'].includes(action))return reply(405,{error:'Unsupported health operation.'})
   if(!String(event.headers?.['content-type']||event.headers?.['Content-Type']||'').startsWith('application/json'))return reply(415,{error:'Use a JSON health request.'})
   if(Buffer.byteLength(event.body||'')>20000)return reply(413,{error:'Health request is too large.'})
   let payload;try{payload=JSON.parse(event.body||'')}catch{return reply(400,{error:'Invalid health request.'})}
   const current=await repo.read(session.member),after=action==='settings'?healthSettings(current.value,payload,now()):applyHealthSnapshot(current.value,payload,now())
   if(after!==current.value)await repo.write(session.member,after,current.etag)
   return reply(200,healthSummary(after,session.member,now()))
  }catch(error){return reply(error.status||503,{error:error.status?error.message:'Health data is temporarily unavailable. Please retry.'})}
 }
}
export const lambdaHandler=createMemberHealthHandler()
export default withLambda(lambdaHandler)

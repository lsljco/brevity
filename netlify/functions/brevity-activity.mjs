import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {householdDate} from '../lib/assistant-authoritative-context.mjs'
const handler=async event=>{
 const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
 const session=await householdAuth.readSession(event).catch(()=>null)
 if(!session)return reply(401,{error:'Sign in to view your activities.'})
 if(event.httpMethod!=='GET')return reply(405,{error:'Activity changes require Action Mode.'})
 const date=householdDate(),resources=createProductionActionResources(),dates=Array.from({length:7},(_,i)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-i);return d.toISOString().slice(0,10)})
 const reads=await Promise.allSettled(dates.map(day=>resources.read(`activity:${session.member}:${day}`)))
 return reply(200,{member:session.member,through:date,entries:reads.flatMap(result=>result.status==='fulfilled'?result.value.value?.entries||[]:[]),unavailableDates:reads.flatMap((result,i)=>result.status==='rejected'?[dates[i]]:[])})
}

export default withLambda(handler)

export {handler as lambdaHandler}

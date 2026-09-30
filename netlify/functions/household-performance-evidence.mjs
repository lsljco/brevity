import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'

export function evidenceDates(from,to){
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
  if(!valid(from)||!valid(to)||to<from)throw Error('Choose a valid date range.')
  const count=(Date.parse(to)-Date.parse(from))/86400000+1
  if(count>366)throw Error('Choose a date range of at most one year, including comparison periods.')
  return Array.from({length:count},(_,index)=>new Date(Date.parse(from)+index*86400000).toISOString().slice(0,10))
}
export function createPerformanceEvidenceHandler({readSession=householdAuth.readSession,resources=null}={}){
  return async event=>{
    const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
    const session=await readSession(event).catch(()=>null)
    if(!session)return reply(401,{error:'Sign in to view performance evidence.'})
    if(event.httpMethod!=='GET')return reply(405,{error:'This endpoint is read-only.'})
    let dates
    try{dates=evidenceDates(event.queryStringParameters?.from,event.queryStringParameters?.to)}catch(error){return reply(400,{error:error.message})}
    let source
    try{source=resources||createProductionActionResources()}catch{return reply(503,{error:'Performance evidence is temporarily unavailable. Please retry.'})}
    const dailyPlans=[],reportedActivities=[],unavailable=[]
    // Bounded parallelism; only this authenticated member's private activity store.
    for(let offset=0;offset<dates.length;offset+=8){
      await Promise.all(dates.slice(offset,offset+8).map(async date=>{
        const results=await Promise.allSettled([source.read(`plan:${date}`),source.read(`activity:${session.member}:${date}`)])
        if(results[0].status==='fulfilled'){
          const record=results[0].value
          if(!record.missing&&record.value)dailyPlans.push({date,assignments:record.value.assignments||[],decisions:record.value.decisions||[]})
        }else unavailable.push({date,source:'daily-plan'})
        if(results[1].status==='fulfilled')reportedActivities.push(...(results[1].value.value?.entries||[]).filter(item=>item.member===session.member).map(item=>({...item,date,owner:session.member})))
        else unavailable.push({date,source:'member-activity'})
      }))
    }
    return reply(200,{member:session.member,from:dates[0],to:dates.at(-1),dailyPlans,reportedActivities,unavailable})
  }
}
export const lambdaHandler=createPerformanceEvidenceHandler()
export default withLambda(lambdaHandler)

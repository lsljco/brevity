import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import { householdDate } from '../lib/assistant-authoritative-context.mjs'
import { createProductionActionResources } from '../lib/assistant-action-executor.mjs'
import { dailyNutrition, NUTRIENTS } from '../lib/nutrition-ledger.mjs'
import { nutritionProgress, weeklyNutritionPilot } from '../lib/nutrition-progress.mjs'

const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})

async function handler(event){
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'})
  const session=await householdAuth.readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to view nutrition records.'})
  try{
    const date=householdDate(),resources=createProductionActionResources()
    const days=await Promise.all(Array.from({length:7},async(_,index)=>{
      const day=new Date(`${date}T12:00:00Z`)
      day.setUTCDate(day.getUTCDate()-index)
      const key=day.toISOString().slice(0,10)
      const record=await resources.read(`nutrition:${session.member}:${key}`)
      return {...dailyNutrition(record.value,session.member,key),version:record.version}
    }))
    const target=await resources.read(`nutrition-targets:${session.member}`)
    const targets=Object.fromEntries(NUTRIENTS.filter(key=>Number.isFinite(target.value?.[key])).map(key=>[key,target.value[key]]))
    const weeklyTotals=Object.fromEntries(NUTRIENTS.map(key=>[key,Number(days.reduce((sum,day)=>sum+day.totals[key],0).toFixed(1))]))
    return json(200,{member:session.member,date,days,weeklyTotals,targets,progress:nutritionProgress(days[0].totals,targets),pilot:weeklyNutritionPilot(days),targetVersion:target.version,targetsUpdatedAt:target.value?.updatedAt||''})
  }catch(error){console.error('[nutrition-records]',error);return json(500,{error:'Could not load nutrition records. Try again.'})}
}

export default withLambda(handler)

export {handler as lambdaHandler}

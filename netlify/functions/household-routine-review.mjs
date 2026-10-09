import {HOUSEHOLD_MEMBERS} from '../../src/homehq/projectData.js'
import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import householdAuth from '../lib/household-auth.cjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {lambdaHandler as calendarHandler} from './icloud-calendar.mjs'
import {buildRoutineReview} from '../../src/household/routinePlanning.js'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {archiveDate} from '../lib/household-archive.mjs'
export async function lambdaHandler(event){
 const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:JSON.stringify(body)})
 const session=await householdAuth.readSession(event).catch(()=>null);if(!session)return json(401,{error:'Sign in to review routines.'})
 if(event.httpMethod!=='GET')return json(405,{error:'Read-only routine review.'})
 try{
  const q=event.queryStringParameters||{},member=q.member||session.member,date=q.date||householdClock().date
  if(member!==session.member&&session.role!=='admin')return json(403,{error:'Only an administrator can prepare another member’s routine.'})
  if(!archiveDate(date))return json(400,{error:'Choose a valid start date.'})
  const resources=createProductionActionResources()
  const [schedule,maintenance,local,apple]=await Promise.all([resources.read('shared:brevity_household_schedule_v1'),resources.read('shared:brevity_household_maintenance_v1'),resources.read('shared:family_calendar_events_v1'),calendarHandler({...event,httpMethod:'GET',queryStringParameters:{}}).catch(()=>null)])
  const appleData=apple?.statusCode===200?JSON.parse(apple.body):null
  const calendar=[...(Array.isArray(local.value)?local.value:[]),...(appleData?.events||[])].filter(x=>!['household-schedule','household-operations'].includes(x.source))
  const members=member==='Household'?HOUSEHOLD_MEMBERS:[member]
  const reviews=members.map(name=>buildRoutineReview({date,member:name,schedule:schedule.value,maintenance:maintenance.value,calendar,variant:q.variant,calendarAvailable:Boolean(appleData)}))
  return json(200,{member,date,week:reviews.flatMap(r=>r.week.map(day=>({...day,member:r.member}))),proposals:reviews.flatMap(r=>r.proposals),questions:reviews.flatMap(r=>r.questions),notice:reviews[0].notice,scheduleVersion:schedule.version})
 }catch(error){return json(503,{error:error.message||'Routine sources are unavailable.'})}
}
export default withLambda(lambdaHandler)

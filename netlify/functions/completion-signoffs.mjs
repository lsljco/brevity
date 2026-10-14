import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {completionSignoffs,CHORE_RESOURCE,PROJECT_RESOURCE} from '../../src/notifications/completionSignoffs.js'
export function createSignoffHandler({readSession=householdAuth.readSession,resources=createProductionActionResources}={}){return async event=>{
 const reply=(statusCode,data)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(data)})
 const session=await readSession(event).catch(()=>null)
 if(!session)return reply(401,{error:'Sign in to view sign-off requests.'})
 if(!['Larry','Terica'].includes(session.member))return reply(403,{error:'Completion review is available to Larry and Terica.'})
 if(event.httpMethod!=='GET')return reply(405,{error:'Sign-off requires reviewed Action Mode approval.'})
 const store=resources(),results=await Promise.allSettled([store.read(CHORE_RESOURCE),session.member==='Larry'?store.read(PROJECT_RESOURCE):Promise.resolve({value:[],version:0})])
 const unavailable=results.flatMap((result,index)=>result.status==='rejected'?[index===0?'chores':'projects']:[])
 return reply(200,{items:completionSignoffs({chores:results[0].status==='fulfilled'?results[0].value:null,projects:results[1].status==='fulfilled'?results[1].value:null,member:session.member}),unavailable})
}}
export const lambdaHandler=createSignoffHandler()
export default withLambda(lambdaHandler)

import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {LEARNING_HUB_RESOURCE} from '../../src/education/learningHub.js'
export const createHandler=({readSession=householdAuth.readSession,resources=createProductionActionResources}={})=>async event=>{
 const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
 const session=await readSession(event).catch(()=>null)
 if(!session)return reply(401,{error:'Sign in to view household learning.'})
 if(event.httpMethod!=='GET')return reply(405,{error:'Learning changes require reviewed approval.'})
 try{const record=await resources().read(LEARNING_HUB_RESOURCE);return reply(200,{items:record.value?.items||[],version:record.version})}catch{return reply(503,{error:'Learning records are unavailable. Please retry.'})}
}
export const lambdaHandler=createHandler()
export default withLambda(lambdaHandler)

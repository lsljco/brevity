import {adaptationSummary} from '../../src/governance/governanceModel.js'
import {readOrchestrationInbox} from '../lib/orchestration-job-repository.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import auth from '../lib/household-auth.cjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {productionAssistantActionRepository} from '../lib/assistant-action-repository.mjs'
import {loadOrchestration} from '../lib/household-orchestration.mjs'
export function createOrchestrationHandler({readSession=auth.readSession,resources,repository}={}) {return async event=>{
  const reply=(statusCode,data)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(data)})
  const session=await readSession(event).catch(()=>null)
  if(!session)return reply(401,{error:'Sign in to review household assistance.'})
  if(event.httpMethod!=='GET')return reply(405,{error:'Changes require Action Mode review.'})
  try{
    const permissions=await (repository||productionAssistantActionRepository()).getPermissions()
    const model=await loadOrchestration({resources:resources||createProductionActionResources(),session:{...session,planning:permissions?.[session.member]?.planning===true},date:event.queryStringParameters?.date})
    const inbox=resources||!model.policyActive||model.paused||!model.configuration?.workerEnabled?{messages:[]}:await readOrchestrationInbox(session.member,{isAdmin:session.role==='admin'}).catch(()=>({messages:[],error:'Background inbox is temporarily unavailable.'}))
    inbox.messages=inbox.messages.filter(message=>message.policyRevision===model.configuration?.revision&&model.cases.some(c=>c.id===message.caseId))
    model.adaptation=adaptationSummary(model.observedCases||[],session.member,model.preferences,new Date(),inbox.observations||[])
    model.healthTrends=inbox.healthTrends||[]
    delete inbox.healthTrends
    delete inbox.observations
    delete model.observedCases
    return reply(200,{...model,inbox})
  }catch{return reply(503,{error:'Assistance sources could not be verified. Refresh before relying on this view.'})}
}}
export default withLambda(createOrchestrationHandler())

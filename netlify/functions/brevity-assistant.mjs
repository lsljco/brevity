import {readConsumptionImage} from '../lib/consumption-image.mjs'
import {productionUsageRepository} from '../lib/usage-metrics.mjs'
import {HOUSEHOLD_MEMBERS} from '../lib/assistant-action-contract.mjs'
import {productionConversationRepository} from '../lib/assistant-conversation-store.mjs'
import {retryableProviderFailure} from '../lib/agent-provider-recovery.mjs'
import {validateAgentProposal} from '../lib/agent-proposal-validation.mjs'
import {buildAssistantInstructions} from '../lib/assistant-instructions.mjs'
import {loadAssistantSupplementalContext,assertActionSourcesAvailable} from '../lib/assistant-supplemental-context.mjs'
import {productionMealPlanRepository} from '../lib/meal-plan-store.mjs'
import {bindRecipeOperation} from '../lib/recipe-library-actions.mjs'
import {bindNutritionOperation} from '../lib/nutrition-conversation.mjs'
import householdAuth from './household-auth.js'
import {
  loadProductionAuthoritativeAssistantContext,
  sanitizeAuthoritativeContext,
} from '../lib/assistant-authoritative-context.mjs'
import { normalizeActionProposal } from '../lib/assistant-action-contract.mjs'
import { productionAssistantActionRepository } from '../lib/assistant-action-repository.mjs'
import { captureExpectedVersions, createProductionActionResources } from '../lib/assistant-action-executor.mjs'
import { mealProteinFocus } from '../lib/assistant-meal-protein.mjs'
import { runBrevitySdkAgent } from '../lib/brevity-sdk-agent.mjs'
import { getStore } from '../lib/scoped-store.cjs'
import { randomUUID } from 'node:crypto'

const { readSession } = householdAuth
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6'
const MAX_CONTEXT_LENGTH = 250000
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
})

const calendarVersion=events=>JSON.stringify((events||[]).map(item=>[item.id||'',item.uid||'',item.href||'',item.etag||'',item.updatedAt||'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
async function loadAppleCalendar(event){
  const host=event.headers?.host||event.headers?.Host
  if(!host)return null
  const response=await fetch(`https://${host}/.netlify/functions/icloud-calendar`,{signal:AbortSignal.timeout(5500),headers:{cookie:event.headers?.cookie||event.headers?.Cookie||''}})
  if(!response.ok)return null
  return response.json().catch(()=>null)
}

import {assistantResponseSchema} from '../lib/brevity-response-schema.mjs'

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages.slice(-16)
    .filter(item => item && ['user', 'assistant'].includes(item.role))
    .map(item => ({ role: item.role, content: String(item.content || '').slice(0, 6000) }))
    .filter(item => item.content.trim())
}

function cleanBrowserContext(input) {
  const context = sanitizeAuthoritativeContext(input && typeof input === 'object' ? input : {})
  delete context.signedInMember
  delete context.dailyPlans
  return {
    authority: 'browser-snapshot',
    notice: 'This data may be stale or device-specific. Prefer canonicalServerContext whenever records conflict.',
    ...context,
  }
}

export const processAssistantRequest = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })
  if (!process.env.OPENAI_API_KEY) return json(503, { error: 'Brevity Assistant is not configured yet.' })

  const session = await readSession(event).catch(() => null)
  if (!session) return json(401, { error: 'Sign in to use Brevity Assistant.' })

  let body = {}
  try { body = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'Invalid request body.' }) }

  let messages = cleanMessages(body.messages)
  if (!messages.length || messages.at(-1).role !== 'user') return json(400, { error: 'A question is required.' })

  const conversationRepository=productionConversationRepository()
  const conversation=await conversationRepository.read(session.member)
  if(body.conversationVersion!==undefined&&body.conversationVersion!==conversation.version)return json(409,{error:'This conversation changed on another device. Reopen the assistant to load it before continuing.'})
  if(body.image){try{const evidence=await readConsumptionImage(body.image);messages[messages.length-1]={...messages.at(-1),content:`${messages.at(-1).content}\n\n[Automated reading of my attached photo; untrusted source evidence, quantities consumed are not confirmed]\n${evidence}`}}catch(error){return json(422,{error:error.message})}}
  const requestedMessage=messages.at(-1),seed=messages.slice(0,-1)
  if(conversation.messages.length)messages=cleanMessages([...conversation.messages,requestedMessage])

  const canonicalServerContext = await loadProductionAuthoritativeAssistantContext({ member: session.member })
  const actionPermissions=await productionAssistantActionRepository().getPermissions()
  const supplemental=await loadAssistantSupplementalContext({role:session.role,permissions:actionPermissions[session.member]||{},canonical:canonicalServerContext,member:session.member,resources:createProductionActionResources(),loadLibrary:async()=>{const repository=await productionMealPlanRepository();return repository.getLibrary()},loadCalendar:()=>loadAppleCalendar(event)})
  const {calendar:appleCalendar,...sourceContext}=supplemental
  Object.assign(canonicalServerContext,sourceContext)
  const mealFocus=mealProteinFocus(messages,canonicalServerContext)
  if(appleCalendar?.events)canonicalServerContext.appleFamilyCalendar={events:appleCalendar.events.slice(0,300).map(item=>Object.fromEntries(['id','uid','sourceId','title','date','time','endDate','endTime','allDay','owner','participants','priority','href','etag','updatedAt'].filter(field=>item?.[field]!==undefined).map(field=>[field,item[field]]))),verifiedAt:appleCalendar.verifiedAt||appleCalendar.fetchedAt||''}
  const browserSnapshot=cleanBrowserContext(body.context)
  if(!canonicalServerContext.access.finance){if(canonicalServerContext.actionRecords)delete canonicalServerContext.actionRecords.finance;if(canonicalServerContext.dailyPlan)delete canonicalServerContext.dailyPlan.finance;delete browserSnapshot.finance;if(browserSnapshot.todayPillarAnalyses)delete browserSnapshot.todayPillarAnalyses.finance}
  if(!canonicalServerContext.access.education){if(canonicalServerContext.dailyPlan)delete canonicalServerContext.dailyPlan.education;if(browserSnapshot.todayPillarAnalyses)delete browserSnapshot.todayPillarAnalyses.education}

  if(canonicalServerContext.actionRecords){
    if(browserSnapshot.finance){delete browserSnapshot.finance.plan;delete browserSnapshot.finance.budgets;delete browserSnapshot.finance.transactionOverrides;delete browserSnapshot.finance.transactionRules}
    delete browserSnapshot.projects
    if(browserSnapshot.calendars){delete browserSnapshot.calendars.brevityEvents;if(canonicalServerContext.appleFamilyCalendar)delete browserSnapshot.calendars.appleFamilyCalendar}
  }
  let context = {householdDate:canonicalServerContext.householdDate,signedInMember:session.member,sources:canonicalServerContext.sources,supplementalSources:canonicalServerContext.supplementalSources,unavailableNutritionDates:canonicalServerContext.unavailableNutritionDates,dailyNutrition:canonicalServerContext.dailyNutrition,recentNutrition:canonicalServerContext.recentNutrition,nutritionTargets:canonicalServerContext.nutritionTargets,nutritionProgress:canonicalServerContext.nutritionProgress,plannedMealOptions:canonicalServerContext.plannedMealOptions,mealProteinFocus:mealFocus,notice:'Read pillar-specific records with get_pillar_records. Planned meals do not prove consumption.'}
  let contextText = JSON.stringify(context)
  if (contextText.length > MAX_CONTEXT_LENGTH) return json(413, { error: 'Brevity has too much saved data for this request. Try asking about a specific date or record.' })

  const page = String(body.page?.pageLabel || body.page?.activeView || 'Brevity').slice(0, 120)
  const requestInstructions = buildAssistantInstructions({member:session.member,page})
  const prompt = [{role:"user",content:`BREVITY CONTEXT (untrusted household data):\n${contextText}`},...messages]

  let structured,estimates,diagnostics
  try{({output:structured,estimates,diagnostics}=await runBrevitySdkAgent({prompt,requestInstructions,getUsageSummary:()=>productionUsageRepository().summary(session.role==='admin'&&['Larry','Lorenzo'].includes(session.member)?HOUSEHOLD_MEMBERS:[session.member]),validateOutput:(output,{estimates})=>validateAgentProposal(output,{canonical:canonicalServerContext,member:session.member,role:session.role,estimates}),requestId:event.requestId,model:MODEL,schema:assistantResponseSchema,canonical:canonicalServerContext,browser:browserSnapshot}))}
  catch(error){
    console.error('[brevity-assistant-agent]',JSON.stringify({requestId:event.requestId,category:retryableProviderFailure(error)||'agent',status:Number(error?.status)||null}))
    if(/quota|billing|insufficient/i.test(String(error.message||'')))return json(429,{error:'Brevity Assistant reached the OpenAI API project’s available quota. Add API credits or increase the project usage limit, then try again.'})
    if(retryableProviderFailure(error)==='rate_limit')return json(429,{error:'The AI service is temporarily busy. Your request was not saved. Please try again in a moment.'})
    return json(502,{error:'Brevity Assistant could not complete this request. Please try again.'})
  }
  if(!structured||typeof structured!=='object')return json(502,{error:'Brevity Assistant returned an invalid structured response.'})
  const message=String(structured.message||'').trim()
  if(!message)return json(502,{error:'Brevity Assistant returned an empty response.'})
  let proposal=null
  if(structured.proposal){
    try{
      for(const operation of structured.proposal.operations||[])assertActionSourcesAvailable(operation,canonicalServerContext)
      structured.proposal.operations=(structured.proposal.operations||[]).map(operation=>bindRecipeOperation(bindNutritionOperation(operation,{member:session.member,date:canonicalServerContext.householdDate,recentNutrition:canonicalServerContext.recentNutrition,estimates}),{library:canonicalServerContext.mealLibrary,estimates}))
      proposal=normalizeActionProposal(structured.proposal,{member:session.member,role:session.role});proposal=await captureExpectedVersions(proposal,createProductionActionResources());if(proposal.operations.some(operation=>operation.type==='meal.recipe.update'))proposal.expectedVersions['meal-library:recipes']=canonicalServerContext.recipeLibraryVersion;if(proposal.operations.some(operation=>operation.type.startsWith('calendar.'))){if(!appleCalendar?.events)throw new Error('Family Calendar could not be verified. Refresh it and ask again.');proposal={...proposal,expectedCalendarVersion:calendarVersion(appleCalendar.events)}}await productionAssistantActionRepository().saveProposal(proposal)}
    catch(error){return json(422,{error:error.message||'The proposed action could not be validated.'})}
  }
  let savedConversation
  try{savedConversation=await conversationRepository.appendTurn(session.member,{version:conversation.version,turnId:event.requestId||randomUUID(),user:requestedMessage,assistant:{role:'assistant',content:message,proposal},seed})}
  catch(error){return json(error.status||503,{error:error.status===409?error.message:'The response could not be saved to your conversation. Please retry; no household change was applied.'})}
  return json(200, {
    conversation:savedConversation,
    _usage:{outcome:diagnostics?.outcome||'answered'},
    message,
    proposal,
    model: MODEL,
    generatedAt: new Date().toISOString(),
    member: session.member,
    page,
    contextSources: canonicalServerContext.sources,
  })
}

const jobs=()=>getStore({name:'brevity-assistant-jobs',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const jobKey=id=>`job-${id}`
const backgroundUrl=event=>`${String(event.headers?.['x-forwarded-proto']||'https').split(',')[0]}://${String(event.headers?.['x-forwarded-host']||event.headers?.host||'brevityoflife.netlify.app').split(',')[0]}/.netlify/functions/brevity-assistant-background`
export const handler=async event=>{
  try{
    const session=await readSession(event).catch(()=>null)
    if(!session)return json(401,{error:'Sign in to use Brevity Assistant.'})
    if(event.httpMethod==='GET'){
      const id=event.queryStringParameters?.jobId
      if(!/^[0-9a-f-]{36}$/.test(id||''))return json(400,{error:'Invalid assistant job.'})
      const status=await jobs().get(jobKey(id),{type:'json'})
      if(!status||status.member!==session.member||Date.parse(status.createdAt)<Date.now()-86400000)return json(404,{error:'Assistant job not found.'})
      if(status.state==='queued'||status.state==='processing'){
        if(Date.now()-Date.parse(status.createdAt)>12*60*1000)return json(504,{error:'Brevity Assistant took too long. Please retry.'})
        return json(202,{state:status.state,jobId:id})
      }
      return json(status.statusCode||502,status.result||{error:'Brevity Assistant could not complete this request.'})
    }
    if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
    const body=JSON.parse(event.body||'{}')
    if(!cleanMessages(body.messages).length)return json(400,{error:'A question is required.'})
    const id=randomUUID(),store=jobs()
    await store.setJSON(jobKey(id),{member:session.member,state:'queued',createdAt:new Date().toISOString(),body})
    const response=await fetch(backgroundUrl(event),{method:'POST',headers:{'content-type':'application/json',cookie:event.headers?.cookie||event.headers?.Cookie||''},body:JSON.stringify({id})})
    if(!response.ok&&response.status!==202)throw Error(`Background dispatch returned ${response.status}`)
    return json(202,{state:'queued',jobId:id})
  }catch(error){console.error('[brevity-assistant-dispatch]',error);return json(502,{error:'Brevity Assistant could not start. Please retry.'})}
}

import {createHash,randomUUID} from 'node:crypto'
import {getStore} from './scoped-store.mjs'
import {householdDate} from './assistant-authoritative-context.mjs'
import build from './release-build-context.mjs'
export const FEEDBACK_CATEGORIES=['voice','latency','accuracy','missing_context','too_many_steps','missing_capability','reliability','other']
const KINDS=['assistant','action','feedback']
const OUTCOMES=['answered','clarification','proposal','blocked','failed','completed','corrected','undone','friction','helpful']
const hash=member=>createHash('sha256').update(String(member)).digest('hex')
export function createUsageRepository({store,householdId='lslj-family',now=()=>new Date()}){
 const key=(member,date)=>`usage/${date}/${hash(JSON.stringify([householdId,member]))}`
 return {
  async record(member,event){
   if(!member||!KINDS.includes(event.kind)||!OUTCOMES.includes(event.outcome)||typeof event.id!=='string'||event.id.length>160)throw Error('Invalid usage event.')
   if(event.category!==undefined&&(event.kind!=='feedback'||!FEEDBACK_CATEGORIES.includes(event.category)))throw Error('Invalid feedback category.')
   const safe={...(event.kind==='feedback'&&event.category?{category:event.category}:{}),id:event.id,kind:event.kind,outcome:event.outcome,outcomeClassificationVersion:2,durationMs:Math.max(0,Math.min(900000,Number(event.durationMs)||0)),at:now().toISOString()},date=householdDate(now())
   for(let attempt=0;attempt<4;attempt++){
    const entry=await store.getWithMetadata(key(member,date),{type:'json'}),events=entry?.data?.events||[]
    const existing=events.find(item=>item.id===safe.id)
    if(existing)return existing
    if(events.length>=2000)throw Error('Daily usage event limit reached.')
    const result=await store.setJSON(key(member,date),{date,events:[...events,safe]},entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
    if(result?.modified!==false)return safe
   }
   throw Error('Usage metrics were busy.')
  },
  async summary(members,{days=7}={}){
   days=Math.max(1,Math.min(30,days));const end=householdDate(now()),dates=Array.from({length:days},(_,i)=>{const d=new Date(`${end}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-i);return d.toISOString().slice(0,10)})
   const summaries=await Promise.all(members.map(async member=>{
    const reads=await Promise.allSettled(dates.map(date=>store.getWithMetadata(key(member,date),{type:'json'})))
    const recordedDays=reads.flatMap((result,i)=>result.status==='fulfilled'&&result.value?.data?[dates[i]]:[])
    const missingDays=reads.flatMap((result,i)=>result.status==='fulfilled'&&!result.value?.data?[dates[i]]:[])
    const events=reads.flatMap(result=>result.status==='fulfilled'?result.value?.data?.events||[]:[]),requests=events.filter(item=>item.kind==='assistant'),actions=events.filter(item=>item.kind==='action')
    const feedbackByCategory=Object.fromEntries([...FEEDBACK_CATEGORIES,'uncategorized'].map(category=>[category,{helpful:events.filter(item=>item.kind==='feedback'&&(item.category||'uncategorized')===category&&item.outcome==='helpful').length,friction:events.filter(item=>item.kind==='feedback'&&(item.category||'uncategorized')===category&&item.outcome==='friction').length}]))
    return {member,feedbackByCategory,recordedDays,missingDays,requests:requests.length,activeDays:new Set(requests.map(item=>householdDate(new Date(item.at)))).size,failedRequests:requests.filter(item=>item.outcome==='failed').length,blockedRequests:requests.filter(item=>item.outcome==='blocked').length,legacyOutcomeRequests:requests.filter(item=>item.outcomeClassificationVersion!==2).length,clarifications:requests.filter(item=>item.outcome==='clarification').length,proposals:requests.filter(item=>item.outcome==='proposal').length,completedActions:actions.filter(item=>['completed','corrected'].includes(item.outcome)).length,corrections:actions.filter(item=>item.outcome==='corrected').length,undos:actions.filter(item=>item.outcome==='undone').length,frictionReports:events.filter(item=>item.outcome==='friction').length,helpfulReports:events.filter(item=>item.outcome==='helpful').length,averageResponseMs:requests.length?Math.round(requests.reduce((n,item)=>n+item.durationMs,0)/requests.length):null,unavailableDays:reads.flatMap((result,i)=>result.status==='rejected'?[dates[i]]:[])}
   }))
   return {from:dates.at(-1),through:end,retentionDays:90,members:summaries,notice:'recordedDays identifies dates with saved metric records; missingDays means no saved measurement, not verified inactivity. unavailableDays means failed reads. No failed reads does not prove full coverage. Counts include instrumented activity only. legacyOutcomeRequests counts requests recorded before full clarification/blocked classification; their older answered outcomes are not retrospectively reclassified, so clarification and blocked counts may understate those requests. No conversation text, food details, bank values or student evidence is stored. Proposal and action counts are period totals, not a causal completion rate. Missing metrics are not proof of no household activity.'}
  },
 }
}
export const usageStore=()=>getStore({name:build.preview?'brevity-preview-usage':'brevity-usage',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export const productionUsageRepository=()=>createUsageRepository({store:usageStore(),householdId:process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'})
export async function recordUsage(member,event){try{await productionUsageRepository().record(member,event)}catch{console.warn('[brevity-usage] metric write unavailable')}}
export async function pruneUsageStore(store,now=new Date()){
 const cutoff=householdDate(new Date(now.getTime()-90*86400000))
 for await(const page of store.list({prefix:'usage/',paginate:true}))for(const blob of page.blobs){const date=blob.key.split('/')[1];if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<cutoff)await store.delete(blob.key)}
}

// Bound by the server to the authenticated member and turn; model input cannot
// choose an identity, event ID, timestamp, or free-text metric payload.
export function createConversationFeedbackRecorder({repository,member,requestId=randomUUID()}){
 let recorded=null
 return async ({outcome,category})=>{
  if(!['helpful','friction'].includes(outcome)||!FEEDBACK_CATEGORIES.includes(category))throw Error('Invalid feedback.')
  if(recorded){
   if(recorded.outcome!==outcome||recorded.category!==category)throw Error('One feedback rating per request. Send a new request to record another rating.')
   return recorded
  }
  const saved=await repository.record(member,{id:`feedback-${requestId}`,kind:'feedback',outcome,category})
  if(saved&&(saved.outcome!==outcome||saved.category!==category))throw Error('A different rating was already recorded for this request.')
  recorded={recorded:true,outcome,category,notice:'Only the rating and category were saved as feedback. This does not create or approve an improvement proposal.'}
  return recorded
 }
}

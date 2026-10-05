import {loadOrchestration,phaseOneEnabled} from './household-orchestration.mjs'
import {GOVERNANCE_RESOURCE} from '../../src/governance/orchestration.js'
import {policyActive,preferenceResource,defaultPreferences,eligibleException} from '../../src/governance/governanceModel.js'
import {getHouseholdDateKey,getHouseholdMinuteOfDay} from '../../src/finance/financeTime.js'
const minute=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5))
// Retention is anchored to the responsibility date, never the most recent polling time.
export const observationDate=observation=>observation.date||observation.id?.match(/\d{4}-\d{2}-\d{2}/)?.[0]||observation.at?.slice(0,10)
export function retainObservation(observation,preferences,now){
 const occurred=Date.parse(`${observationDate(observation)}T00:00:00Z`)
 return preferences.learning&&Number.isFinite(occurred)&&occurred>=now.getTime()-preferences.retentionDays*86400000
}
export async function cleanObservations(observations,getPreferences,now){
 const retained=[]
 for(const observation of observations||[])if(retainObservation(observation,await getPreferences(observation.member),now))retained.push(observation)
 return retained
}
export function createOrchestrationRunner({store,key,resources,now=()=>new Date(),createId=()=>crypto.randomUUID()}){
 return async()=>{
  const date=getHouseholdDateKey(now()),entry=await store.getWithMetadata(key,{type:'json'}),prior=entry?.data||{}
  if(Date.parse(prior.leaseUntil)>now().getTime())return {state:'waiting'}
  const token=createId(),claimed={...prior,lease:token,leaseUntil:new Date(now().getTime()+90000).toISOString()}
  if((await store.setJSON(key,claimed,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true}))?.modified===false)return {state:'contended'}
  const prefs=new Map(),prefVersions=new Map()
  const getPrefs=async member=>{
   if(!prefs.has(member)){
    const record=await resources.read(preferenceResource(member))
    prefVersions.set(member,record.version);prefs.set(member,{...defaultPreferences(),...record.value})
   }
   return prefs.get(member)
  }
  let observations=[]
  const finish=async patch=>{
   // Recheck consent even when orchestration is paused, waiting or disabled.
   for(const [member,version] of prefVersions)if((await resources.read(preferenceResource(member))).version!==version){
    observations=observations.filter(o=>o.member!==member)
   }
   const latest=await store.getWithMetadata(key,{type:'json'})
   if(latest?.data?.lease!==token)return false
   return (await store.setJSON(key,{...latest.data,...patch,observations,lease:null,leaseUntil:null},{onlyIfMatch:latest.etag}))?.modified!==false
  }
  try{
   observations=await cleanObservations(prior.observations,getPrefs,now())
   const governance=await resources.read(GOVERNANCE_RESOURCE),policy=governance.value?.policy
   if(!phaseOneEnabled()||!policyActive(policy,date)||!policy.workerEnabled||governance.value.paused){
    await finish({messages:[]});return {state:'inactive'}
   }
   const samePolicy=prior.policyRevision===policy.revision
   if(samePolicy&&Date.parse(prior.nextRunAt)>now().getTime()){await finish({});return {state:'waiting'}}
   const model=await loadOrchestration({resources,session:{member:'Brevity',role:'admin'},date,backlogCheckedAt:prior.backlogCheckedAt||{},trackedCases:[...(prior.trackedCases||[]),...(prior.messages||[]),...(prior.observations||[]).map(o=>({date:observationDate(o),caseId:o.caseId}))]})
   const liveCases=new Map(model.cases.filter(item=>item.stage!=='paused'&&item.sourceQuality==='available').map(item=>[item.id,item]))
   const recipientsFor=item=>item.kind==='care'?item.owners:[...new Set([...item.owners,...item.requests.filter(r=>r.response==='pending').map(r=>r.recipient),...(eligibleException(item,policy,now())?[policy.decisionMaker]:[])])]
   const inspectedDates=new Set([date,...model.backlog.inspectedDates])
   const previousMessages=(prior.messages||[]).filter(m=>m.policyRevision===policy.revision&&(!inspectedDates.has(m.date)||liveCases.has(m.caseId)&&recipientsFor(liveCases.get(m.caseId)).includes(m.recipient)))
   // Keep existing inbox items during quiet hours and while other cases get their turn.
   const messages=new Map(previousMessages.map(m=>[m.id,m])),processed=Object.fromEntries(Object.entries(prior.processed||{}).filter(([id])=>(prior.trackedCases||[]).some(item=>item.caseId===id)))
   for(const id of liveCases.keys())if(prior.processed?.[id])processed[id]=prior.processed[id]
   const selected=[...liveCases.values()].sort((a,b)=>(Date.parse(processed[a.id])||0)-(Date.parse(processed[b.id])||0)||(b.risk.score||0)-(a.risk.score||0)||a.id.localeCompare(b.id)).slice(0,50)
   const currentMinute=getHouseholdMinuteOfDay(now()),at=now().toISOString()
   for(const item of selected){
    processed[item.id]=at
    for(const recipient of recipientsFor(item)){
     const pref=await getPrefs(recipient),id=`${item.date}:${item.id}:${recipient}`,existing=messages.get(id)
     const exception=item.kind!=='care'&&recipient===policy.decisionMaker&&eligibleException(item,policy,now())
     // Never retain an outdated leadership packet after the case loses escalation eligibility.
     if(existing?.exception&&!exception)messages.delete(id)
     if(currentMinute<minute(pref.startTime)||currentMinute>=minute(pref.endTime))continue
     if(existing&&Date.parse(existing.updatedAt)>now().getTime()-policy.promptMinutes*60000&&Boolean(existing.exception)===exception)continue
     messages.set(id,{id,date:item.date,caseId:item.id,recipient,title:item.title,owner:item.owners.join(', ')||'Unresolved',stage:item.stage,createdAt:existing?.createdAt||at,updatedAt:at,style:pref.style,authority:exception?'L5 in-app exception':'L1 in-app prompt',exception:exception?item.exception:null,preparation:item.assistance,policyRevision:policy.revision})
    }
   }
   for(const item of model.observedCases)for(const member of item.owners){
    const pref=await getPrefs(member),id=`${item.id}:${member}`
    if(!retainObservation({date:item.date},pref,now()))continue
    const i=observations.findIndex(o=>o.id===id),old=i<0?{}:observations[i],message=[...messages.values()].find(m=>m.caseId===item.id&&m.recipient===member)
    const observation={...old,id,caseId:item.id,date:item.date,member,at:old.at||at,lastObservedAt:at,style:old.style||message?.style||null,state:item.state,sourceId:item.sourceId,kind:item.kind,promptedAt:old.promptedAt||message?.createdAt||message?.updatedAt||null,acknowledgedAt:item.events.find(e=>e.actor===member&&e.event==='acknowledge')?.at||null}
    if(i<0)observations.push(observation);else observations[i]=observation
   }
   for(const [source,version] of Object.entries(Object.assign({},model.sourceVersions,...model.observedCases.map(item=>item.sourceVersions)))){
    // A missing independent source is reported, not allowed to disable known responsibilities.
    const record=await resources.read(source).catch(()=>null)
    const required=model.sourceStates[source]==='available'||model.observedCases.some(item=>item.sourceResource===source&&item.sourceQuality==='available')
    if(required&&(!record||record.missing||record.value==null)||record&&record.version!==version)throw Error('Responsibility sources changed during follow-up.')
   }
   if((await resources.read(GOVERNANCE_RESOURCE)).version!==governance.version)throw Error('Policy or cases changed during follow-up.')
   const healthTrends=[...(prior.healthTrends||[]).filter(point=>point.date!==date&&Date.parse(point.date)>=now().getTime()-policy.recurrenceWindow*86400000),{date,at,open:model.cases.length,unknown:model.systemHealth.unknown,blocked:model.systemHealth.blocked,dependencies:model.systemHealth.unresolvedDependencies,pendingSupport:model.systemHealth.pendingSupport,acceptedSupport:model.systemHealth.acceptedSupport,conflicts:model.systemHealth.confirmedConflicts,recovery:model.systemHealth.recoveryPlans,unavailableSources:model.systemHealth.unavailableSources}]
   const trackedCases=[...(prior.trackedCases||[]).filter(item=>!model.closedCases.some(closed=>closed.id===item.caseId)),...model.cases.map(item=>({caseId:item.id,date:item.date}))]
   const backlogCheckedAt=Object.fromEntries([...new Set([...trackedCases.map(item=>item.date),...Object.values(governance.value.cases||{}).map(item=>item.date)])].filter(day=>day<date).map(day=>[day,inspectedDates.has(day)?at:prior.backlogCheckedAt?.[day]||null]))
   const saved=await finish({processed,trackedCases:[...new Map(trackedCases.map(item=>[item.caseId,item])).values()],backlogCheckedAt,coverage:{processed:selected.length,available:liveCases.size,unavailableSources:model.systemHealth.unavailableSources},healthTrends,messages:[...messages.values()],policyRevision:policy.revision,lastRun:at,nextRunAt:new Date(now().getTime()+15*60000).toISOString(),error:model.systemHealth.unavailableSources?'Partial coverage: available responsibilities continue; review unavailable sources.':null,failures:0})
   return saved?{state:'completed',messages:messages.size}:{state:'contended'}
  }catch{
   // Transient infrastructure failure is not a household policy change. Retry with bounded backoff.
   const failures=(prior.failures||0)+1
   await finish({messages:[],failures,error:'Follow-up incomplete; automatic retry pending. Existing household records are unchanged.',nextRunAt:new Date(now().getTime()+Math.min(360,15*2**Math.min(failures,5))*60000).toISOString()}).catch(()=>null)
   return {state:'retry-pending'}
  }
 }
}

import {loadOrchestration,phaseOneEnabled} from './household-orchestration.mjs'
import {GOVERNANCE_RESOURCE} from '../../src/governance/orchestration.js'
import {policyActive,preferenceResource,defaultPreferences,eligibleException} from '../../src/governance/governanceModel.js'
import {getHouseholdDateKey,getHouseholdMinuteOfDay} from '../../src/finance/financeTime.js'
const minute=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5))
export function createOrchestrationRunner({store,key,resources,now=()=>new Date(),createId=()=>crypto.randomUUID()}){
 return async()=>{
  if(!phaseOneEnabled())return {state:'disabled'}
  const date=getHouseholdDateKey(now()),governance=await resources.read(GOVERNANCE_RESOURCE),policy=governance.value?.policy
  if(!policyActive(policy,date)||!policy.workerEnabled||governance.value.paused)return {state:'inactive'}
  const entry=await store.getWithMetadata(key,{type:'json'}),prior=entry?.data||{}
  // A new reviewed policy revision resets the bounded retry circuit.
  const samePolicy=prior.policyRevision===policy.revision
  if(samePolicy&&prior.failures>=6)return {state:'attention-required'}
  if(Date.parse(prior.leaseUntil)>now().getTime()||(samePolicy&&Date.parse(prior.nextRunAt)>now().getTime()))return {state:'waiting'}
  const token=createId(),claimed={...prior,failures:samePolicy?(prior.failures||0):0,policyRevision:policy.revision,lease:token,leaseUntil:new Date(now().getTime()+90000).toISOString()}
  if((await store.setJSON(key,claimed,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true}))?.modified===false)return {state:'contended'}
  try{
   // Read shared coordination sources only. No Action Mode execution or member impersonation for source writes.
   const model=await loadOrchestration({resources,session:{member:'Brevity',role:'admin'},date})
   if(model.systemHealth.unavailableSources)throw Error('Shared responsibility sources are incomplete.')
   const previousMessages=(prior.messages||[]).filter(m=>m.policyRevision===policy.revision),messages=[],observations=[]
   const prefs=new Map(),currentMinute=getHouseholdMinuteOfDay(now()),at=now().toISOString()
   const getPrefs=async member=>{if(!prefs.has(member))prefs.set(member,{...defaultPreferences(),...(await resources.read(preferenceResource(member)))?.value});return prefs.get(member)}
   for(const item of [...model.cases].sort((a,b)=>(b.risk.score||0)-(a.risk.score||0)||Number(b.state==='blocked')-Number(a.state==='blocked')||a.date.localeCompare(b.date)).slice(0,50)){
    if(item.stage==='paused')continue
    const recipients=[...new Set([...item.owners,...item.requests.filter(r=>r.response==='pending').map(r=>r.recipient),...(eligibleException(item,policy)?[policy.decisionMaker]:[])])]
    for(const recipient of recipients){
     const pref=await getPrefs(recipient)
     if(currentMinute<minute(pref.startTime)||currentMinute>=minute(pref.endTime))continue
     const id=`${item.date}:${item.id}:${recipient}`,existing=previousMessages.find(m=>m.id===id)
     const cooling=existing&&Date.parse(existing.updatedAt)>now().getTime()-policy.promptMinutes*60000
     messages.push({id,date:item.date,caseId:item.id,recipient,title:item.title,owner:item.owners.join(', ')||'Unresolved',stage:item.stage,updatedAt:cooling?existing.updatedAt:at,authority:recipient===policy.decisionMaker&&eligibleException(item,policy)?'L5 in-app exception':'L1 in-app prompt',exception:recipient===policy.decisionMaker&&eligibleException(item,policy)?item.exception:null,preparation:item.assistance,policyRevision:policy.revision})
    }
   }
   // Derived personal observations are opt-in and physically expire. Audit receipts are separate and immutable.
   for(const old of prior.observations||[]){const pref=await getPrefs(old.member);if(pref.learning&&Date.parse(old.at)>=now().getTime()-pref.retentionDays*86400000)observations.push(old)}
   for(const item of model.observedCases)for(const member of item.owners){
    const pref=await getPrefs(member);if(!pref.learning)continue
    const id=`${item.id}:${member}`,i=observations.findIndex(o=>o.id===id),old=i<0?{}:observations[i]
    const observation={...old,id,member,at,style:pref.style,state:item.state,sourceId:item.sourceId,kind:item.kind,promptedAt:old.promptedAt||messages.find(m=>m.caseId===item.id&&m.recipient===member)?.updatedAt||null,acknowledgedAt:item.events.find(e=>e.actor===member&&e.event==='acknowledge')?.at||null}
    if(i<0)observations.push(observation);else observations[i]=observation
   }
   for(const [source,version] of Object.entries(Object.assign({},model.sourceVersions,...model.cases.map(item=>item.sourceVersions))))if((await resources.read(source)).version!==version)throw Error('Responsibility sources changed during follow-up.')
   if((await resources.read(GOVERNANCE_RESOURCE)).version!==governance.version)throw Error('Policy or cases changed during follow-up.')
   const latest=await store.getWithMetadata(key,{type:'json'})
   if(latest?.data?.lease!==token)return {state:'lease-lost'}
   const healthTrends=[...(prior.healthTrends||[]).filter(point=>point.date!==date&&Date.parse(point.date)>=now().getTime()-policy.recurrenceWindow*86400000),{date,at,open:model.cases.length,unknown:model.systemHealth.unknown,blocked:model.systemHealth.blocked,dependencies:model.systemHealth.unresolvedDependencies,pendingSupport:model.systemHealth.pendingSupport,acceptedSupport:model.systemHealth.acceptedSupport,conflicts:model.systemHealth.confirmedConflicts,recovery:model.systemHealth.recoveryPlans}]
   const result=await store.setJSON(key,{coverage:{processed:Math.min(50,model.cases.length),available:model.cases.length},healthTrends,messages:messages.slice(-150),observations:observations.slice(-4500),policyRevision:policy.revision,lastRun:at,nextRunAt:new Date(now().getTime()+15*60000).toISOString(),lease:null,leaseUntil:null,error:null,failures:0},{onlyIfMatch:latest.etag})
   return result?.modified===false?{state:'contended'}:{state:'completed',messages:messages.length}
  }catch{
   const latest=await store.getWithMetadata(key,{type:'json'})
   if(latest?.data?.lease===token){const failures=(latest.data.failures||0)+1;await store.setJSON(key,{...latest.data,messages:[],lease:null,leaseUntil:null,failures,error:failures>=6?'Follow-up stopped after six failures. Review sources, then review and ratify a new policy revision to resume.':'Follow-up incomplete; retry pending.',nextRunAt:new Date(now().getTime()+Math.min(360,15*2**Math.min(failures,5))*60000).toISOString()},{onlyIfMatch:latest.etag})}
   return {state:'retry-pending'}
  }
 }
}

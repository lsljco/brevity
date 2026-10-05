import {scheduleForMember,normalizeHouseholdScheduleState} from '../../src/household/householdScheduleData.js'
import {policyActive,defaultPreferences,preferenceResource,scheduleConflicts,adaptationSummary,recoveryExitOperations} from '../../src/governance/governanceModel.js'
import {getHouseholdDateKey} from '../../src/finance/financeTime.js'
import {buildOrchestration,GOVERNANCE_RESOURCE,GOV_POLICY} from '../../src/governance/orchestration.js'
import {validPracticeDate} from '../../src/household/operatingPractices.js'
export const phaseOneEnabled=()=>process.env.BREVITY_GOV001_PHASE1_ENABLED!=='false'
export async function loadOrchestration({resources,session,date,includeBacklog=true,enabled=phaseOneEnabled()}) {
  if(!enabled)return {enabled:false,policy:GOV_POLICY,notice:'Household orchestration is disabled. Existing household workflows remain available.'}
  if(!validPracticeDate(date))throw Error('Choose a valid household date.')
  const keys=[`plan:${date}`,'shared:brevity_household_schedule_v1','shared:brevity_household_maintenance_v1',GOVERNANCE_RESOURCE]
  const results=await Promise.allSettled(keys.map(key=>resources.read(key)))
  const sourceStates={},versions={},values={}
  results.forEach((result,i)=>{
    const key=keys[i],record=result.status==='fulfilled'?result.value:null
    const valid=record&&Number.isInteger(record.version)&&record.version>=0
    sourceStates[key]=valid&&!record.missing&&record.value!=null?'available':'unavailable'
    if(valid){versions[key]=record.version;values[key]=record.value}
  })
  // No initialization during GET. Missing governance is an empty preview, not an error.
  const model=buildOrchestration({date,policyDate:getHouseholdDateKey(),plan:values[keys[0]],schedule:values[keys[1]],maintenance:values[keys[2]],saved:values[GOVERNANCE_RESOURCE]||{},sourceStates:Object.fromEntries(keys.slice(0,3).map(k=>[k,sourceStates[k]])),versions:Object.fromEntries(keys.slice(0,3).filter(k=>versions[k]!=null).map(k=>[k,versions[k]])),member:session.member,isAdmin:session.role==='admin'})
  const governance=values[GOVERNANCE_RESOURCE]||{}
  const backlogDates=includeBacklog?[...new Set(Object.values(governance.cases||{}).map(c=>c.date).filter(d=>validPracticeDate(d)&&d<date))].sort().reverse():[]
  const backlog=await Promise.allSettled(backlogDates.slice(0,7).map(day=>loadOrchestration({resources,session,date:day,includeBacklog:false,enabled})))
  for(const result of backlog)if(result.status==='fulfilled'){model.cases.push(...result.value.cases);model.observedCases.push(...result.value.observedCases);model.systemHealth.unavailableSources+=result.value.systemHealth.unavailableSources}else model.systemHealth.unavailableSources++
  model.backlog={inspectedDates:backlogDates.slice(0,7),additionalDates:Math.max(0,backlogDates.length-7)}
  Object.assign(model.systemHealth,{visibleOpenCases:model.cases.length,unknown:model.cases.filter(c=>c.state==='unknown').length,blocked:model.cases.filter(c=>c.state==='blocked').length,unassigned:model.cases.filter(c=>!c.owners.length).length})
  const care=session.member==='Brevity'?null:await resources.read('health:care').catch(()=>null)
  const healthCare=care?{available:true,version:care.version,items:(care.value?.items||[]).filter(item=>session.role==='admin'||item.member===session.member)}:{available:false,notice:'Shared care could not be verified.'}
  const ownPreferences=await resources.read(preferenceResource(session.member)).catch(()=>null)
  const preferences={...defaultPreferences(),...ownPreferences?.value}
  for(const item of model.cases){
    if(item.owners.includes(session.member)){
      if(preferences.style==='options')item.assistance.checklist=[...item.assistance.options,...item.assistance.checklist]
      if(preferences.style==='prepared-draft')item.assistance.checklist=[`Draft outcome: ${item.outcome}`,`Owner decision: ${item.assistance.questions[0]}`,...item.assistance.checklist]
      if(preferences.supportStrategy)item.assistance.recommendation+=` Your stated support preference: ${preferences.supportStrategy}`
    }
  }
  const adaptive=adaptationSummary(model.observedCases,session.member,preferences)
  if(adaptive.enabled&&adaptive.strategies.length)for(const item of model.cases.filter(c=>c.owners.includes(session.member)))item.assistance.recommendation+=` Previously reported helpful strategy: ${adaptive.strategies.at(-1).note}`
  const minutes=new Set()
  for(const block of scheduleForMember(normalizeHouseholdScheduleState(values[keys[1]]||{}),date,session.member)){const toMinute=v=>typeof v==='string'&&/^\d{2}:\d{2}$/.test(v)?Number(v.slice(0,2))*60+Number(v.slice(3)):NaN;for(let m=toMinute(block.startTime);m<toMinute(block.endTime)&&m<1440;m++)minutes.add(m)}
  const capacity={availableMinutes:preferences.capacityMinutes,scheduledMinutes:minutes.size,overCapacity:preferences.capacityMinutes!==null&&minutes.size>preferences.capacityMinutes}
  const conflicts=scheduleConflicts(values[keys[1]],date,session.member,session.role==='admin')
  const workload=Object.entries(model.cases.reduce((out,c)=>{for(const owner of c.owners)out[owner]=(out[owner]||0)+1;return out},{})).map(([member,count])=>({member,count}))
  const recovery=Object.values(governance.recovery||{}).map(r=>({...r,exitOperations:recoveryExitOperations(r,getHouseholdDateKey()),displayStatus:r.status==='active'&&r.endsOn<getHouseholdDateKey()?'review exit':r.status}))
  const policy=governance.policy||null
  const sourceHealthy=model.systemHealth.unavailableSources===0
  return {...model,enabled:true,isAdmin:session.role==='admin',version:versions[GOVERNANCE_RESOURCE]??null,caseStoreAvailable:results[3].status==='fulfilled',canReview:session.role==='admin'||session.planning===true,
    healthCare,configuration:policy,policyActive:policyActive(policy,getHouseholdDateKey()),preferences,preferenceVersion:ownPreferences?.version??null,
    adaptation:adaptive,capacity,conflicts,workload,recovery,
    routines:(values[keys[1]]?.routines||[]).map(({id,title,owner,days,enabled})=>({id,title,owner,days,enabled})),
    systemHealth:{...model.systemHealth,confirmedConflicts:conflicts.length,unresolvedDependencies:model.cases.reduce((n,c)=>n+c.dependencies.filter(d=>model.cases.some(x=>x.id===d.id)).length,0),recurringExceptions:Object.values(governance.cases||{}).filter(c=>(session.role==='admin'||model.observedCases.some(item=>item.id===c.id))&&c.date>=new Date(Date.now()-(policy?.recurrenceWindow||28)*86400000).toISOString().slice(0,10)&&c.events?.some(e=>e.event==='escalate')).length,coverageStability:model.cases.filter(c=>c.requests.some(r=>r.response==='accept-support')||c.coveredBy).length,acceptedSupport:model.cases.reduce((n,c)=>n+c.requests.filter(r=>r.response==='accept-support').length,0),pendingSupport:model.cases.reduce((n,c)=>n+c.requests.filter(r=>r.response==='pending').length,0),recoveryPlans:recovery.filter(r=>r.status==='active').length,notice:`${sourceHealthy?'Available':'Partial'} source coverage. Workload counts are not time or capacity estimates. Recurrence requires recorded evidence; no individual attainment score is used.`}}

}
export async function validateOrchestrationCase({operation,resources,session}) {
  const model=await loadOrchestration({resources,session,date:operation.targetDate})
  if(model.paused)throw Error('Household assistance is paused. Resume it before recording assistance.')
  const keys=Object.keys(model.sourceVersions)
  if(keys.length!==3||keys.some(key=>operation.payload.sourceVersions[key]!==model.sourceVersions[key]))throw Object.assign(Error('The responsibility sources changed. Refresh and prepare a new review.'),{code:'VERSION_CONFLICT'})
  const item=model.cases.find(x=>x.id===operation.targetId)
  if(item&&!item.owners.includes(session.member)&&item.coveredBy!==session.member&&session.role!=='admin')throw Object.assign(Error('Only the responsible member can record this assistance event.'),{code:'FORBIDDEN'})
  if(!item||item.date!==operation.targetDate)throw Object.assign(Error('This responsibility is unavailable, completed, or outside your ownership. Refresh the source.'),{code:'FORBIDDEN'})
  if(item.stage==='paused'&&!['resume','pause'].includes(operation.payload.event))throw Error('Resume this case before recording assistance.')
  return item
}

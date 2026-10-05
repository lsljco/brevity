import {policyActive,recoveryOperations,recoveryExitOperations} from '../../src/governance/governanceModel.js'
import {GOVERNANCE_RESOURCE} from '../../src/governance/orchestration.js'
import {getHouseholdDateKey} from '../../src/finance/financeTime.js'
export async function validateGovernance({operation,resources,session,model,proposal,value,now=new Date()}){
 const type=operation.type,p=operation.payload,today=getHouseholdDateKey(now)
 if(type==='orchestration.policy.approve'){
  if(value?.policy?.revision!==p.revision)throw Error('Review the latest policy configuration before ratification.')
  return {}
 }
 if(type==='orchestration.preferences.update'||type==='orchestration.policy.update')return {}
 if(!policyActive(value?.policy,today))throw Error('GOV-001 requires current recorded ratification before coordination or recovery.')
 if(value?.paused)throw Error('Household assistance is paused.')
 if(type==='orchestration.recovery.update'){
  if(p.intent==='propose'){
   if(p.startsOn<today)throw Error('Recovery overrides must start today or later.')
   const source=await resources.read('shared:brevity_household_schedule_v1')
   if(source.version!==p.scheduleVersion)throw Error('Schedule changed. Refresh the recovery proposal.')
   const operations=recoveryOperations(p,source.value)
   if(operations.length>7)throw Error('Review at most seven dated recovery changes at once. Narrow the dates or routines.')
   return {recoveryOperations:operations}
  }
  const saved=value?.recovery?.[operation.targetId]
  if(!saved)throw Error('The recovery plan no longer exists.')
  if(['activate','end'].includes(p.intent)){
   if(p.intent==='activate'&&(saved.status!=='proposed'||saved.endsOn<today))throw Error('This recovery proposal is no longer available for activation.')
   if(p.intent==='end'&&saved.status!=='active')throw Error('Only an active recovery plan can be ended.')
   const expected=p.intent==='end'?recoveryExitOperations(saved,today):(saved.operations||[]),actual=proposal.operations.filter(x=>x.type==='household.schedule.occurrence.update')
   if(actual.length!==expected.length||expected.some(x=>!actual.some(y=>x.targetId===y.targetId&&x.targetDate===y.targetDate&&JSON.stringify(x.payload)===JSON.stringify(y.payload))))throw Error('Recovery activation must include its exact reviewed dated Schedule changes.')
   const source=await resources.read('shared:brevity_household_schedule_v1')
   if(expected.length&&source.version!==(p.intent==='end'?saved.activatedScheduleVersion:saved.scheduleVersion))throw Error('Schedule changed since this recovery plan was prepared. Prepare a revised recovery plan.')
  }else if(saved.status!=='active')throw Error('Only an active recovery plan can be ended.')
  return {}
 }
 const keys=Object.keys(model.sourceVersions||{})
 if(keys.length!==3||keys.some(k=>p.sourceVersions[k]!==model.sourceVersions[k]))throw Error('The responsibility sources changed. Refresh before coordination.')
 const item=model.cases.find(c=>c.id===operation.targetId)
 if(!item)throw Error('This case is unavailable or outside your access.')
 const owns=session.role==='admin'||item.owners.includes(session.member)||item.coveredBy===session.member
 if(item.stage==='paused')throw Error('Resume this case before coordination.')
 if(['accept-support','decline-support'].includes(p.event)){
  const request=item.requests.find(r=>r.id===p.requestId)
  if(!request||request.recipient!==session.member||request.response!=='pending')throw Error('Only the invited support member can answer a pending request.')
 }else if(p.event==='decision'){
  if(session.member!==value.policy.decisionMaker||(!item.events.some(e=>e.event==='escalate'&&e.recipient===session.member)&&!item.automaticException))throw Error('Only the designated recipient can record this exception decision.')
 }else if(!owns)throw Error('Only the responsible member or administrator can coordinate this case.')
 if(p.event==='request-support'){
  if(!value.policy.supportMembers.includes(p.recipient)||item.owners.includes(p.recipient))throw Error('Choose an approved support member who is not the owner.')
  if(item.requests.some(r=>r.recipient===p.recipient&&r.response!=='decline-support'))throw Error('This support request already exists.')
 }
 if(p.event==='escalate'){
  if(!item.risk.complete)throw Error('Record the evidenced consequence assessment before escalation.')
  if(!item.events.some(e=>e.event==='prepare')&&item.risk.factors.urgency.value<4)throw Error('Prepare useful assistance before routine escalation. Immediate urgency must be evidenced.')
  if(item.events.some(e=>e.event==='escalate'))throw Error('This exception is already shared with the designated decision-maker.')
 }
 if(p.event==='dependency'){
  const dependency=model.cases.find(c=>c.id===p.dependencyId)
  if(!dependency||dependency.id===item.id)throw Error('Choose a different responsibility you can access.')
  const visited=new Set(),reaches=id=>{if(id===item.id)return true;if(visited.has(id))return false;visited.add(id);return (value.cases?.[id]?.events||[]).filter(e=>e.event==='dependency').some(e=>reaches(e.dependencyId))}
  if(reaches(dependency.id))throw Error('This dependency would create a cycle.')
  return {case:item,dependency}
 }
 return {case:item}
}

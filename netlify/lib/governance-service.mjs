import {policyActive,recoveryOperations,recoveryExitOperations,escalationReadiness,activeDependencies,caseResolved} from '../../src/governance/governanceModel.js'
import {GOVERNANCE_RESOURCE} from '../../src/governance/orchestration.js'
import {getHouseholdDateKey} from '../../src/finance/financeTime.js'
export async function validateGovernance({operation,resources,session,model,proposal,value,now=new Date()}){
 const type=operation.type,p=operation.payload,today=getHouseholdDateKey(now)
 if(type==='orchestration.policy.approve'){
  if(value?.policy?.revision!==p.revision)throw Error('Review the latest policy configuration before ratification.')
  return {}
 }
 if(type==='orchestration.preferences.update'||type==='orchestration.policy.update')return {}
 const recoveryExit=type==='orchestration.recovery.update'&&p.intent==='end'
 if(!recoveryExit&&!policyActive(value?.policy,today))throw Error('GOV-001 requires current recorded ratification before coordination or recovery.')
 if(!recoveryExit&&value?.paused)throw Error('Household assistance is paused.')
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
   const source=await resources.read('shared:brevity_household_schedule_v1')
   const expected=p.intent==='end'?recoveryExitOperations(saved,today,source.value,source.version):(saved.operations||[]),actual=proposal.operations.filter(x=>x.type==='household.schedule.occurrence.update')
   if(actual.length!==expected.length||expected.some(x=>!actual.some(y=>x.targetId===y.targetId&&x.targetDate===y.targetDate&&JSON.stringify(x.payload)===JSON.stringify(y.payload))))throw Error('Recovery activation must include its exact reviewed dated Schedule changes.')
   if(expected.length&&!(p.intent==='end'&&saved.activatedOverrides)&&source.version!==(p.intent==='end'?saved.activatedScheduleVersion:saved.scheduleVersion))throw Error('Schedule changed since this recovery plan was prepared. Prepare a revised recovery plan.')
  }else if(saved.status!=='active')throw Error('Only an active recovery plan can be ended.')
  return {}
 }
 const item=[...model.cases,...(model.closedCases||[])].find(c=>c.id===operation.targetId)
 if(!item||item.date!==operation.targetDate)throw Error('This case is unavailable, has a different source date, or is outside your access.')
 const keys=Object.keys(item?.sourceVersions||{})
 if(item&&(!keys.length||keys.some(k=>p.sourceVersions[k]!==item.sourceVersions[k])))throw Error('The responsibility sources changed. Refresh before coordination.')
 if((caseResolved(item.events)||['completed','verified'].includes(item.state))&&!['learn','reopen','remove-dependency'].includes(p.event))throw Error('This case is closed. Record learning or review reopening assistance.')
 const owns=session.role==='admin'||item.owners.includes(session.member)||item.coveredBy===session.member
 if(item.stage==='paused')throw Error('Resume this case before coordination.')
 if(['accept-support','decline-support'].includes(p.event)){
  const request=item.requests.find(r=>r.id===p.requestId)
  if(!request||request.recipient!==session.member||request.response!=='pending')throw Error('Only the invited support member can answer a pending request.')
 }else if(p.event==='decision'){
  if(session.member!==value.policy.decisionMaker||(!item.events.some(e=>e.event==='escalate'&&e.recipient===session.member)&&!item.automaticException))throw Error('Only the designated recipient can record this exception decision.')
 }else if(!owns)throw Error('Only the responsible member or administrator can coordinate this case.')
 if(p.event==='withdraw-support'&&!item.requests.some(r=>r.id===p.requestId&&r.response!=='withdraw-support'))throw Error('Choose an active support request to withdraw.')
 if(p.event==='request-support'){
  if(!value.policy.supportMembers.includes(p.recipient)||item.owners.includes(p.recipient))throw Error('Choose an approved support member who is not the owner.')
  if(item.requests.some(r=>r.recipient===p.recipient&&!['decline-support','withdraw-support'].includes(r.response)))throw Error('This support request already exists.')
 }
 if(p.event==='escalate'){
  const readiness=escalationReadiness(item,value.policy,now);if(!readiness.allowed)throw Error(readiness.reason)
  const recent=item.events.slice(item.events.findLastIndex(e=>e.event==='reopen')+1)
  if(recent.some(e=>e.event==='escalate'))throw Error('This exception is already shared with the designated decision-maker.')
 }
 if(p.event==='remove-dependency'&&!item.dependencies.some(d=>d.id===p.dependencyId))throw Error('This dependency is no longer active.')
 if(p.event==='reopen'&&['completed','verified'].includes(item.state))throw Error('Reopen the responsibility in its source workflow first. Learning remains available.')
 if(p.event==='dependency'){
  const dependency=model.cases.find(c=>c.id===p.dependencyId)
  if(!dependency||dependency.id===item.id)throw Error('Choose a different responsibility you can access.')
  const visited=new Set(),reaches=id=>{if(id===item.id)return true;if(visited.has(id))return false;visited.add(id);return activeDependencies(value.cases?.[id]?.events||[]).some(e=>reaches(e.id))}
  if(reaches(dependency.id))throw Error('This dependency would create a cycle.')
  return {case:item,dependency}
 }
 return {case:item}
}

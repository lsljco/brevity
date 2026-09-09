import { createHash, randomUUID } from 'node:crypto'
import householdAuth from './household-auth.js'
import { normalizeActionProposal, normalizePermissionMatrix, permissionForOperation, selectedOperation } from '../lib/assistant-action-contract.mjs'
import { productionAssistantActionRepository } from '../lib/assistant-action-repository.mjs'
import { assertExactExpectedVersions, commitPreparedRecordOperations, createProductionActionResources, prepareRecordOperations, recordForOperation, resourceForOperation, resourceLastActionId, sameResourceValue } from '../lib/assistant-action-executor.mjs'
import { productionMealPlanRepository } from '../lib/meal-plan-store.mjs'
import { productionSermonSourceRepository } from '../lib/sermon-source-repository.mjs'
import { MEALS_BY_ID } from '../../src/meals/mealLibrary.js'

const { readSession } = householdAuth
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const parseBody=event=>{try{return JSON.parse(event.body||'{}')}catch{return null}}
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const actionId=(prefix,id)=>{const raw=String(id||''),clean=raw.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,100);return`${prefix}-${clean}-${fingerprint(raw).slice(0,16)}`}
export const publicAssistantAudit=audit=>({
  id:audit.id,proposalId:audit.proposalId,summary:audit.summary,actor:audit.actor,
  action:audit.action,status:audit.status,occurredAt:audit.occurredAt,
  undoAvailable:Boolean(audit.undoAvailable),undoneAt:audit.undoneAt||null,undoneBy:audit.undoneBy||null,
  affectedRecords:(audit.affectedRecords||audit.changes||[]).map(({resource,beforeVersion,afterVersion})=>({resource,beforeVersion,afterVersion})),
  operations:(audit.operations||[]).map(({id,type,domain,description,targetId,targetDate,selectedScope})=>({id,type,domain,description,...(targetId?{targetId}:{}),...(targetDate?{targetDate}:{}),selectedScope})),
})

async function calendarRequest(event, method, body) {
  const host=event.headers?.host||event.headers?.Host
  if(!host)throw new Error('Brevity could not resolve the Family Calendar endpoint.')
  const headers={cookie:event.headers?.cookie||event.headers?.Cookie||'','content-type':'application/json'}
  if(process.env.BREVITY_AUTOMATION_KEY)headers['x-brevity-automation-key']=process.env.BREVITY_AUTOMATION_KEY
  const response=await fetch(`https://${host}/.netlify/functions/icloud-calendar`,{method,headers,body:body?JSON.stringify(body):undefined})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok){const error=new Error(payload.error||`Family Calendar action failed (${response.status}).`);if(response.status===409)error.code='VERSION_CONFLICT';throw error}
  return payload
}

export const calendarVersion=events=>JSON.stringify((events||[]).map(item=>[item.id||'',item.uid||'',item.href||'',item.etag||'',item.updatedAt||'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
export function assertExecutableProposalVersions(proposal,operations=proposal?.operations||[]){
  assertExactExpectedVersions(proposal,operations)
  if(operations.some(operation=>operation.type?.startsWith('calendar.'))&&(typeof proposal?.expectedCalendarVersion!=='string'||!proposal.expectedCalendarVersion)){
    throw Object.assign(new Error('This proposal does not retain an exact reviewed Family Calendar version. Refresh and prepare a new Action Mode review.'),{code:'VERSION_CONFLICT'})
  }
  return true
}
const calendarRecord=(events,targetId)=>(events||[]).find(item=>[item.id,item.uid,item.sourceId].includes(targetId))||null
const eventToken=event=>String(event?.etag||event?.updatedAt||'')
const calendarFields=['sourceId','actionId','title','date','time','allDay','pillar','owner','participants','notes','priority']
const calendarTime=value=>{const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);if(!match)return String(value||'');let hour=Number(match[1]);if(match[3]?.toUpperCase()==='PM'&&hour<12)hour+=12;if(match[3]?.toUpperCase()==='AM'&&hour===12)hour=0;return`${String(hour).padStart(2,'0')}:${match[2]}`}
const sameCalendarValue=(current,planned)=>calendarFields.every(field=>{
  if(!(field in (planned||{})))return true
  if(field==='time')return calendarTime(current?.[field])===calendarTime(planned[field])
  return JSON.stringify(current?.[field]??(Array.isArray(planned[field])?[]:''))===JSON.stringify(planned[field])
})
const calendarCreateSourceId=operation=>`assistant-${operation.targetId||operation.id}`
const calendarCreateCandidate=(operation,member)=>({sourceId:calendarCreateSourceId(operation),title:operation.payload.title||operation.description,date:operation.payload.date||operation.targetDate,time:operation.payload.time||'',allDay:operation.payload.allDay!==false,pillar:'household',owner:operation.payload.owner||member,participants:operation.payload.participants||[],notes:operation.payload.notes||'',priority:operation.payload.priority==='high'})
export const reviewedExecutionSession=(requestSession,proposal)=>{
  if(!proposal?.startedBy||!['admin','member'].includes(proposal.startedRole))throw Object.assign(new Error('This in-progress proposal does not retain the reviewed actor role. Prepare and review a new proposal.'),{code:'VERSION_CONFLICT'})
  return{...requestSession,member:proposal.startedBy,role:proposal.startedRole}
}

export async function prepareCalendarProposal({input,session,permissions,events,repository,now=new Date(),id}) {
  const rawOperation=input?.operation
  if(!rawOperation||!['calendar.create','calendar.update'].includes(rawOperation.type)){
    throw Object.assign(new Error('Direct Family Calendar review supports creating or updating a Brevity calendar event.'),{code:'INVALID_ACTION'})
  }
  let proposal
  try{
    proposal=normalizeActionProposal({summary:input.summary,operations:[rawOperation]},{member:session.member,role:session.role,now,id})
  }catch(error){throw Object.assign(error,{code:'INVALID_ACTION'})}
  const operations=[]
  for(const operation of proposal.operations){
    const current=operation.type==='calendar.update'?calendarRecord(events,operation.targetId):null
    if(operation.type==='calendar.update'){
      if(!current)throw Object.assign(new Error('That Family Calendar event no longer exists. Refresh the calendar before reviewing this change.'),{code:'VERSION_CONFLICT'})
      if(String(current.id||'').includes('::'))throw Object.assign(new Error('Recurring Apple Calendar occurrences must be changed in Apple Calendar so Brevity does not damage the series.'),{code:'INVALID_ACTION'})
      if(!String(current.sourceId||'').startsWith('assistant-'))throw Object.assign(new Error('Only events created by Brevity can be edited here. Edit this event in Apple Calendar.'),{code:'FORBIDDEN'})
      const reviewedToken=String(input.expectedEventToken||'')
      const currentToken=eventToken(current)
      if(!reviewedToken||!currentToken||reviewedToken!==currentToken)throw Object.assign(new Error('This calendar event changed after you opened it, or Apple did not provide a safe version marker. Refresh and review the newer version before trying again.'),{code:'VERSION_CONFLICT'})
    }
    const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions,currentRecord:current})
    if(!permission.allowed)throw Object.assign(new Error(permission.reason),{code:'FORBIDDEN'})
    if(operation.type==='calendar.create'){
      const candidate=calendarCreateCandidate(operation,session.member)
      const existing=calendarRecord(events,candidate.sourceId)
      if(existing){
        if(!sameCalendarValue(existing,candidate))throw Object.assign(new Error('This daily-plan item is already linked to a different Family Calendar event. Open Family Calendar to review it.'),{code:'VERSION_CONFLICT'})
        continue
      }
    }
    operations.push(operation)
  }
  if(!operations.length)return null
  proposal={...proposal,operations,expectedCalendarVersion:calendarVersion(events)}
  await repository.saveProposal(proposal)
  return proposal
}

export async function prepareMealProposal({input,session,permissions,repository,mealRepository,now=new Date(),id}) {
  const date=String(input?.date||''),mealType=String(input?.mealType||''),mealId=String(input?.mealId||'')
  const expectedVersion=Number(input?.expectedVersion)
  const replacement=MEALS_BY_ID.get(mealId)
  let proposal
  try{
    proposal=normalizeActionProposal({
      summary:`Replace ${mealType} on ${date}`,
      operations:[{
        type:'meal.substitute',targetDate:date,
        description:`Replace ${mealType} with ${replacement?.name||mealId}`,
        payload:{mealType,mealId},
      }],
    },{member:session.member,role:session.role,now,id})
  }catch(error){throw Object.assign(error,{code:'INVALID_ACTION'})}
  let operation=proposal.operations[0]
  const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions})
  if(!permission.allowed)throw Object.assign(new Error(permission.reason),{code:'FORBIDDEN'})
  const persistedDay=await mealRepository.getDay(date)
  const day=persistedDay||(await mealRepository.getWindowReadOnly({startDate:date,count:1})).days[0]
  if(!day||!Number.isInteger(expectedVersion)||expectedVersion<1||Number(day.version)!==expectedVersion){
    throw Object.assign(new Error('The meal plan changed after you opened it. Refresh and review the current meal before applying a replacement.'),{code:'VERSION_CONFLICT'})
  }
  const currentMealId=day.meals?.[mealType]
  if(!currentMealId)throw Object.assign(new Error('That meal is not available on the selected meal-plan day.'),{code:'INVALID_ACTION'})
  if(currentMealId===mealId)throw Object.assign(new Error('Choose a different meal before reviewing this replacement.'),{code:'INVALID_ACTION'})
  const currentMeal=MEALS_BY_ID.get(currentMealId)
  operation={...operation,targetId:currentMealId,description:`Replace ${currentMeal?.name||currentMealId} with ${replacement?.name||mealId}`}
  // A missing day remains only a deterministic preview during review. Exact
  // version zero lets the reviewed executor create-and-substitute it with one
  // conditional write; any concurrent initialization makes that apply stale.
  proposal={...proposal,operations:[operation],expectedVersions:{[`meal:${date}`]:persistedDay?expectedVersion:0}}
  await repository.saveProposal(proposal)
  return proposal
}

export async function prepareSermonProposal({input,session,permissions,repository,resources,sourceRepository,now=new Date(),id}) {
  const draftId=String(input?.draftId||''),sourceHash=String(input?.sourceHash||''),expectedVersion=Number(input?.expectedVersion)
  if(!draftId||!/^[a-f0-9]{64}$/.test(sourceHash)||!Number.isInteger(expectedVersion)||expectedVersion<0)throw Object.assign(new Error('Refresh Spiritual Maturity and choose an exact retained sermon draft before opening review.'),{code:'VERSION_CONFLICT'})
  const draft=await sourceRepository.draft(draftId)
  if(!draft||draft.state!=='ready')throw Object.assign(new Error('That sermon-analysis draft is no longer available. Analyze the source again without replacing the active sermon.'),{code:'VERSION_CONFLICT'})
  if(session.role!=='admin'&&draft.createdBy!==session.member)throw Object.assign(new Error('Only the member who prepared this sermon draft or an administrator can activate it.'),{code:'FORBIDDEN'})
  if(draft.id!==draftId||draft.sourceHash!==sourceHash||draft.source?.sourceHash!==sourceHash||Number(draft.baseActiveVersion)!==expectedVersion)throw Object.assign(new Error('The retained sermon draft does not match the source and active version you reviewed.'),{code:'VERSION_CONFLICT'})
  const active=await sourceRepository.active()
  if(active.version!==expectedVersion)throw Object.assign(new Error('The active sermon changed after this draft was prepared. Refresh and review the newer source before activating a replacement.'),{code:'VERSION_CONFLICT'})
  let proposal
  try{
    proposal=normalizeActionProposal({summary:`Activate reviewed sermon: ${draft.sermonNotes?.documentTitle||draft.sermonNotes?.title||draft.source?.title||'Sermon source'}`,operations:[{
      type:'sermon.activate',targetId:'active-sermon',description:`Replace the active sermon with the retained ${draft.source?.sourceKind==='notes'?'sermon-notes':'transcript'} analysis`,
      payload:{draftId,sourceHash,candidateJson:JSON.stringify(draft)},allowedScopes:['this-item'],defaultScope:'this-item',
    }]},{member:session.member,role:session.role,now,id})
  }catch(error){throw Object.assign(error,{code:'INVALID_ACTION'})}
  const operation=proposal.operations[0]
  const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions,currentRecord:active.value})
  if(!permission.allowed)throw Object.assign(new Error(permission.reason),{code:'FORBIDDEN'})
  proposal={...proposal,expectedVersions:{'sermon:active':expectedVersion}}
  await prepareRecordOperations({proposal,session,permissions,resources,now:()=>now})
  await repository.saveProposal(proposal)
  return proposal
}

const DIRECT_REVIEW_TYPES=new Set(['decision.create','decision.update','assignment.create','assignment.update','plan.overview.update','plan.pillar.update','plan.alignment.update','plan.recap.update','household.schedule.block.create','household.schedule.block.update','household.schedule.block.delete','household.schedule.invitation.update','household.schedule.routine.create','household.schedule.routine.update','household.schedule.routine.delete','household.schedule.occurrence.update','household.maintenance.coverage.update','household.maintenance.exception.update','household.maintenance.completion.update','household.inventory.item.create','household.inventory.quantity.update','household.inventory.waste.create','project.create','project.update','project.delete','transaction.update','meeting.action.create','meeting.action.update','meeting.correction.create','meeting.correction.update','meeting.session.create','meeting.workspace.update','meeting.history.update','budget.update','forecast.update','finance.account.link','recurring.create','recurring.update','recurring.delete'])
export async function prepareDirectProposal({input,session,permissions,repository,resources,now=new Date(),id}) {
  const requested=Array.isArray(input?.operations)?input.operations:input?.operation?[input.operation]:[]
  if(!requested.length||requested.some(operation=>!DIRECT_REVIEW_TYPES.has(operation?.type))){
    throw Object.assign(new Error('This direct editor is not connected to a supported Action Mode change.'),{code:'INVALID_ACTION'})
  }
  let proposal
  try{
    proposal=normalizeActionProposal({summary:input.summary,operations:requested},{member:session.member,role:session.role,now,id})
  }catch(error){throw Object.assign(error,{code:'INVALID_ACTION'})}
  const resource=resourceForOperation(proposal.operations[0]),expectedVersion=Number(input.expectedVersion)
  if(proposal.operations.some(operation=>resourceForOperation(operation)!==resource))throw Object.assign(new Error('Each direct Action Mode review must change one versioned record group.'),{code:'INVALID_ACTION'})
  if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw Object.assign(new Error('Refresh this record before reviewing the change.'),{code:'VERSION_CONFLICT'})
  proposal={...proposal,expectedVersions:{[resource]:expectedVersion}}
  // This dry preparation validates the exact target and current permission
  // against the reviewed version without mutating anything.
  await prepareRecordOperations({proposal,session,permissions,resources,now:()=>now})
  await repository.saveProposal(proposal)
  return proposal
}

export async function prepareCalendarOperations({event,operations,session,permissions,expectedCalendarVersion,calendarRequestFn=calendarRequest}) {
  const selected=operations.filter(operation=>operation.type.startsWith('calendar.'))
  if(!selected.length)return{prepared:[]}
  const remote=await calendarRequestFn(event,'GET')
  if(expectedCalendarVersion!==undefined&&calendarVersion(remote.events)!==expectedCalendarVersion)throw Object.assign(new Error('The Family Calendar changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
  const prepared=[]
  for(const operation of selected){
    const current=(remote.events||[]).find(item=>[item.id,item.uid,item.sourceId].includes(operation.targetId))||null
    const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions,currentRecord:current})
    if(!permission.allowed)throw Object.assign(new Error(permission.reason),{code:'FORBIDDEN'})
    if(operation.type!=='calendar.create'&&!current)throw new Error('That Family Calendar event no longer exists. Refresh and ask again.')
    if(operation.type!=='calendar.create'&&String(current.id||'').includes('::'))throw new Error('Recurring Apple Calendar occurrences must currently be changed in Apple Calendar so Brevity does not damage the series.')
    if(operation.type==='calendar.create'){
      const candidate=calendarCreateCandidate(operation,session.member)
      const duplicate=calendarRecord(remote.events,candidate.sourceId)
      if(duplicate)throw Object.assign(new Error('A Family Calendar event already uses this Action Mode identifier. Refresh before trying again.'),{code:'VERSION_CONFLICT'})
      prepared.push({resource:'calendar:apple-family',operationType:operation.type,before:null,after:candidate})
    }else if(operation.type==='calendar.update'){
      const candidate={...current,...operation.payload,id:current.uid||current.id,href:current.href,etag:current.etag}
      prepared.push({resource:'calendar:apple-family',operationType:operation.type,before:current,after:candidate})
    }else{
      prepared.push({resource:'calendar:apple-family',operationType:operation.type,before:current,after:null})
    }
  }
  return{prepared}
}

// Calendar writes are also recoverable after an uncertain network response.
// Brevity-created source ids are deterministic, while update/delete recovery
// verifies the exact reviewed Apple version before it performs a new write.
export async function commitPreparedCalendarOperations({event,prepared=[],calendarRequestFn=calendarRequest,mutationId=''}) {
  const changes=[]
  for(const change of prepared){
    const remote=await calendarRequestFn(event,'GET')
    const reference=change.after||change.before
    const current=calendarRecord(remote.events,reference?.id||reference?.uid||reference?.sourceId)
    if(change.operationType==='calendar.create'){
      if(current){
        if(!mutationId||current.actionId!==mutationId||!sameCalendarValue(current,{...change.after,actionId:mutationId}))throw Object.assign(new Error('The Family Calendar event changed while Action Mode was recovering.'),{code:'VERSION_CONFLICT'})
        changes.push({...change,after:current});continue
      }
      const candidate={...change.after,...(mutationId?{actionId:mutationId}:{})}
      const created=await calendarRequestFn(event,'POST',candidate)
      changes.push({...change,after:{...candidate,...created}});continue
    }
    if(change.operationType==='calendar.update'){
      if(!current)throw Object.assign(new Error('The Family Calendar event disappeared while Action Mode was recovering.'),{code:'VERSION_CONFLICT'})
      if(eventToken(current)===eventToken(change.before)){
        const candidate={...change.after,href:current.href,etag:current.etag,...(mutationId?{actionId:mutationId}:{})}
        const updated=await calendarRequestFn(event,'PUT',candidate)
        changes.push({...change,after:{...candidate,...updated}});continue
      }
      if(!mutationId||current.actionId!==mutationId||!sameCalendarValue(current,{...change.after,actionId:mutationId}))throw Object.assign(new Error('A newer Family Calendar edit exists, so Action Mode recovery stopped.'),{code:'VERSION_CONFLICT'})
      changes.push({...change,after:current});continue
    }
    if(!current){
      if(!mutationId)throw Object.assign(new Error('The Family Calendar event disappeared before its reviewed deletion could be verified.'),{code:'VERSION_CONFLICT'})
      await calendarRequestFn(event,'DELETE',{...change.before,actionId:mutationId})
      changes.push({...change,after:null});continue
    }
    if(eventToken(current)!==eventToken(change.before))throw Object.assign(new Error('A newer Family Calendar edit exists, so Action Mode recovery stopped.'),{code:'VERSION_CONFLICT'})
    await calendarRequestFn(event,'DELETE',{...current,...(mutationId?{actionId:mutationId}:{})})
    changes.push({...change,after:null})
  }
  return changes
}

const dateFromNow=now=>now instanceof Date?now:typeof now==='function'?now():new Date()
const journalInProgress=()=>Object.assign(new Error('This Action Mode change is already being applied. Wait a moment, then retry; Brevity will resume it without applying it twice.'),{code:'ACTION_IN_PROGRESS'})

async function claimJournalMutation({repository,journalId,now,leaseMs,attemptId}) {
  const instant=dateFromNow(now)
  return repository.updateJournal(journalId,current=>{
    if(!['prepared','mutating'].includes(current.state))return current
    const active=current.state==='mutating'&&new Date(current.leaseExpiresAt||0)>instant&&current.mutationAttempt!==attemptId
    if(active)throw journalInProgress()
    return{...current,state:'mutating',mutationAttempt:attemptId,mutationStartedAt:current.mutationStartedAt||instant.toISOString(),leaseExpiresAt:new Date(instant.getTime()+leaseMs).toISOString()}
  })
}

const PERMISSIONS_RESOURCE='shared:assistant-action-permissions'
export function createPermissionActionResources(repository,base={}) {
  return{
    ...base,
    async read(resource){
      if(resource!==PERMISSIONS_RESOURCE)return base.read(resource)
      const state=await repository.getPermissionsState()
      return{value:state.permissions,version:state.version,record:state.record}
    },
    async write(resource,value,expectedVersion,actor,mutationId=''){
      if(resource!==PERMISSIONS_RESOURCE)return base.write(resource,value,expectedVersion,actor,mutationId)
      const saved=await repository.savePermissions(value,actor,expectedVersion,mutationId)
      return{value:normalizePermissionMatrix(saved),version:saved.version}
    },
  }
}

const permissionOperations=(before,after)=>Object.keys(after).flatMap(member=>Object.keys(after[member]||{}).filter(domain=>before?.[member]?.[domain]!==after[member][domain]).map(domain=>({
  id:`permission-${member}-${domain}`,type:'permissions.update',domain:'permissions',targetId:member,selectedScope:'this-item',
  description:`${after[member][domain]?'Enabled':'Disabled'} ${domain} access for ${member}`,
})))

export async function savePermissionsWithJournal({repository,matrix,session,expectedVersion,now=()=>new Date(),leaseMs=15_000,createAttemptId=randomUUID}) {
  if(session?.role!=='admin')throw Object.assign(new Error('Household administrator access is required to change Action Mode permissions.'),{code:'FORBIDDEN'})
  const normalized=normalizePermissionMatrix(matrix),version=expectedVersion
  if(!Number.isInteger(version)||version<0)throw Object.assign(new Error('Review the current permission version before saving.'),{code:'VERSION_CONFLICT'})
  const intent=fingerprint({actor:session.member,actorRole:session.role,expectedVersion:version,permissions:normalized})
  const journalId=actionId('permissions',intent),auditId=actionId('audit-permissions',intent),requestHash=intent
  let {journal}=await repository.getJournalEntry(journalId)
  if(!journal){
    const resources=createPermissionActionResources(repository),current=await resources.read(PERMISSIONS_RESOURCE)
    if(Number(current.version)!==version)throw Object.assign(new Error('Action Mode permissions changed after review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
    const operations=permissionOperations(current.value,normalized)
    if(!operations.length)throw Object.assign(new Error('No member permission changes are waiting to be saved.'),{code:'INVALID_ACTION'})
    journal=await repository.ensureJournal({
      id:journalId,kind:'permissions',subjectId:intent,proposalId:null,auditId,requestHash,state:'prepared',
      actor:session.member,actorRole:session.role,summary:'Updated Action Mode member permissions',operations,
      recordPrepared:[{resource:PERMISSIONS_RESOURCE,before:current.value,after:normalized,beforeVersion:current.version,afterVersion:current.version+1}],
      preparedAt:dateFromNow(now).toISOString(),
    })
  }
  if(journal.requestHash!==requestHash||journal.actor!==session.member||journal.actorRole!==session.role)throw Object.assign(new Error('This permission recovery journal does not match the reviewed administrator change.'),{code:'VERSION_CONFLICT'})
  const resources=createPermissionActionResources(repository)
  if(['prepared','mutating'].includes(journal.state)){
    const attemptId=createAttemptId()
    journal=await claimJournalMutation({repository,journalId,now,leaseMs,attemptId})
    if(journal.state==='mutating'&&journal.mutationAttempt!==attemptId)throw journalInProgress()
    const changes=await commitPreparedRecordOperations({prepared:journal.recordPrepared,session,resources,mutationId:journal.id})
    const mutatedAt=dateFromNow(now).toISOString()
    journal=await repository.updateJournal(journalId,current=>{
      if(['mutated','audited','completed'].includes(current.state))return current
      if(current.state!=='mutating'||current.mutationAttempt!==attemptId)throw journalInProgress()
      return{...current,state:'mutated',changes,mutatedAt,leaseExpiresAt:null}
    })
  }
  let audit=await repository.getAudit(journal.auditId)
  if(journal.state==='mutated'){
    const completionHash=fingerprint({journalId:journal.id,operations:journal.operations,changes:journal.changes,occurredAt:journal.mutatedAt})
    audit=await repository.addAudit({id:journal.auditId,journalId:journal.id,proposalId:null,summary:journal.summary,actor:journal.actor,actorRole:journal.actorRole,action:'permissions',status:'completed',occurredAt:journal.mutatedAt,operations:journal.operations,changes:journal.changes,completionHash,undoAvailable:true},{idempotent:true})
    journal=await repository.updateJournal(journalId,current=>['audited','completed'].includes(current.state)?current:{...current,state:'audited',auditedAt:audit.occurredAt})
  }
  if(!audit)audit=await repository.getAudit(journal.auditId)
  if(!audit)throw new Error('Action Mode could not recover the immutable audit for this permission change.')
  if(journal.state==='audited')journal=await repository.updateJournal(journalId,current=>current.state==='completed'?current:{...current,state:'completed',completedAt:audit.occurredAt})
  return{journal,audit,permissions:journal.changes[0].after,permissionVersion:journal.changes[0].afterVersion}
}

export async function executeActionWithJournal({repository,proposal,operations,session,permissions,resources,event,calendarRequestFn=calendarRequest,now=()=>new Date(),leaseMs=15_000,createAttemptId=randomUUID}) {
  assertExecutableProposalVersions(proposal,operations)
  const journalId=actionId('execute',proposal.id)
  const auditId=actionId('audit-execute',proposal.id)
  const requestHash=fingerprint({proposalId:proposal.id,actor:session.member,actorRole:session.role,operations,expectedVersions:proposal.expectedVersions||{},expectedCalendarVersion:proposal.expectedCalendarVersion})
  let {journal}=await repository.getJournalEntry(journalId)
  if(!journal){
    const recordPlan=await prepareRecordOperations({proposal:{...proposal,operations},session,permissions,resources,now})
    const calendarPlan=await prepareCalendarOperations({event,operations,session,permissions,expectedCalendarVersion:proposal.expectedCalendarVersion,calendarRequestFn})
    journal=await repository.ensureJournal({
      id:journalId,kind:'execute',subjectId:proposal.id,proposalId:proposal.id,auditId,requestHash,
      state:'prepared',actor:session.member,actorRole:session.role,summary:proposal.summary,operations,
      recordPrepared:recordPlan.prepared,calendarPrepared:calendarPlan.prepared,
      preparedAt:dateFromNow(now).toISOString(),
    })
  }
  if(journal.requestHash!==requestHash||journal.actor!==session.member)throw Object.assign(new Error('This recovery journal does not match the reviewed Action Mode change.'),{code:'VERSION_CONFLICT'})
  if(['prepared','mutating'].includes(journal.state)){
    const attemptId=createAttemptId()
    journal=await claimJournalMutation({repository,journalId,now,leaseMs,attemptId})
    if(journal.state==='mutating'&&journal.mutationAttempt!==attemptId)throw journalInProgress()
    const journalSession={...session,member:journal.actor}
    const recordChanges=await commitPreparedRecordOperations({prepared:journal.recordPrepared,session:journalSession,resources,mutationId:journal.id})
    const calendarChanges=await commitPreparedCalendarOperations({event,prepared:journal.calendarPrepared,calendarRequestFn,mutationId:journal.id})
    const changes=[...recordChanges,...calendarChanges]
    const mutatedAt=dateFromNow(now).toISOString()
    journal=await repository.updateJournal(journalId,current=>{
      if(['mutated','audited','completed'].includes(current.state))return current
      if(current.state!=='mutating'||current.mutationAttempt!==attemptId)throw journalInProgress()
      return{...current,state:'mutated',changes,mutatedAt,leaseExpiresAt:null}
    })
  }
  let audit=await repository.getAudit(journal.auditId)
  if(journal.state==='mutated'){
    const completionHash=fingerprint({journalId:journal.id,operations:journal.operations,changes:journal.changes,occurredAt:journal.mutatedAt})
    audit=await repository.addAudit({
      id:journal.auditId,journalId:journal.id,proposalId:journal.proposalId,summary:journal.summary,
      actor:journal.actor,action:'execute',status:'completed',occurredAt:journal.mutatedAt,
      actorRole:journal.actorRole,
      operations:journal.operations,changes:journal.changes,completionHash,undoAvailable:true,
    },{idempotent:true})
    journal=await repository.updateJournal(journalId,current=>['audited','completed'].includes(current.state)?current:{...current,state:'audited',auditedAt:audit.occurredAt})
  }
  if(!audit)audit=await repository.getAudit(journal.auditId)
  if(!audit)throw new Error('Action Mode could not recover the immutable audit for this completed mutation.')
  return{journal,audit}
}

export async function completeExecutionJournal({repository,journalId,completedAt}) {
  return repository.updateJournal(journalId,current=>current.state==='completed'?current:{...current,state:'completed',completedAt})
}

// Undo is deliberately strict: any newer record version stops restoration,
// even when the serialized value happens to look identical. A later version
// is itself evidence that another completed write occurred after review.
export const unchangedSinceAction=(current,change)=>Number(current?.version)===Number(change?.afterVersion)

const undoForbidden=message=>Object.assign(new Error(message),{code:'FORBIDDEN'})

// Undo is a new mutation, not a continuation of the original member's old
// authority. Re-evaluate every operation against the member's current domain
// permission and the current record ownership before claiming an Undo journal
// or running version preflight. Administrators retain the same explicit
// override used by normal Action Mode execution.
export async function authorizeUndoOperations({event,audit,session,permissions,resources,calendarRequestFn=calendarRequest}) {
  if(session.role==='admin')return
  if(audit.actor!==session.member)throw undoForbidden('Only the member who completed this action or an administrator can undo it.')
  const operations=Array.isArray(audit.operations)?audit.operations:[]
  if(!operations.length)throw undoForbidden('This older action does not retain enough permission detail for member Undo. A household administrator must review it.')
  const resourceStates=new Map()
  let calendarEvents=null
  for(const operation of operations){
    let currentRecord=null
    if(operation.type?.startsWith('calendar.')){
      if(!calendarEvents)calendarEvents=(await calendarRequestFn(event,'GET')).events||[]
      const calendarChange=(audit.changes||[]).find(change=>change.resource==='calendar:apple-family')
      const reference=calendarChange?.after||calendarChange?.before
      const targetId=operation.targetId||reference?.id||reference?.uid||reference?.sourceId||`assistant-${operation.id}`
      currentRecord=calendarRecord(calendarEvents,targetId)
    }else{
      let resource
      try{resource=resourceForOperation(operation)}catch{
        throw undoForbidden('This action no longer has enough current record detail for member Undo. A household administrator must review it.')
      }
      if(!resourceStates.has(resource))resourceStates.set(resource,await resources.read(resource))
      currentRecord=recordForOperation(resourceStates.get(resource).value,operation)
    }
    const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions,currentRecord})
    if(!permission.allowed)throw undoForbidden(`Undo is no longer permitted: ${permission.reason}`)
  }
}

export async function undoAudit({event,audit,session,permissions,resources,calendarRequestFn=calendarRequest,mutationId='',authorizationChecked=false}) {
  if(!audit?.undoAvailable||audit.undoneAt)throw new Error('This action is not available to undo.')
  if(session.role!=='admin'&&audit.actor!==session.member)throw Object.assign(new Error('Only the member who completed this action or an administrator can undo it.'),{code:'FORBIDDEN'})
  if(!authorizationChecked)await authorizeUndoOperations({event,audit,session,permissions,resources,calendarRequestFn})
  const preflight=new Map()
  const calendarChanges=(audit.changes||[]).filter(change=>change.resource==='calendar:apple-family')
  let remoteCalendar=[]
  if(calendarChanges.length){
    const remote=await calendarRequestFn(event,'GET')
    remoteCalendar=remote.events||[]
    for(const change of calendarChanges){
      const reference=change.after||change.before
      const current=calendarRecord(remoteCalendar,reference?.id||reference?.uid||reference?.sourceId)
      if(change.before===null&&change.after){
        if(!current||!eventToken(change.after)||eventToken(current)!==eventToken(change.after))throw Object.assign(new Error('The created Family Calendar event changed after this action, so Undo was stopped to protect it.'),{code:'VERSION_CONFLICT'})
      }else if(change.before&&change.after){
        if(!current||!eventToken(change.after)||eventToken(current)!==eventToken(change.after))throw Object.assign(new Error('The Family Calendar event changed after this action, so Undo was stopped to protect it.'),{code:'VERSION_CONFLICT'})
      }else if(change.before&&!change.after&&current){
        throw Object.assign(new Error('The deleted Family Calendar event was recreated or replaced, so Undo was stopped to protect it.'),{code:'VERSION_CONFLICT'})
      }
      preflight.set(change,current)
    }
  }
  for(const change of audit.changes||[]){
    if(change.resource==='calendar:apple-family')continue
    const current=await resources.read(change.resource)
    if(!unchangedSinceAction(current,change))throw Object.assign(new Error('A newer household edit exists, so Undo was stopped to protect it.'),{code:'VERSION_CONFLICT'})
    preflight.set(change.resource,current)
  }
  const restored=[]
  for(const change of [...(audit.changes||[])].reverse()){
    if(change.resource==='calendar:apple-family'){
      const current=preflight.get(change)
      if(change.before===null&&change.after)await calendarRequestFn(event,'DELETE',{...current,...(mutationId?{actionId:mutationId}:{})})
      else if(change.before&&change.after)await calendarRequestFn(event,'PUT',{...change.before,id:change.before.uid||change.before.id,href:current.href,etag:current.etag,...(mutationId?{actionId:mutationId}:{})})
      else if(change.before&&!change.after)await calendarRequestFn(event,'POST',{...change.before,_restoreDeleted:true,...(mutationId?{actionId:mutationId}:{})})
      restored.push(change.resource);continue
    }
    const current=preflight.get(change.resource)
    await resources.write(change.resource,change.before,current.version,`Undo by ${session.member}`,mutationId);restored.push(change.resource)
  }
  return restored
}

async function detectUndoRecovery({event,audit,resources,calendarRequestFn,mutationId}) {
  const pending=[],restored=[]
  const calendarChanges=(audit.changes||[]).filter(change=>change.resource==='calendar:apple-family')
  let remote=[]
  if(calendarChanges.length)remote=(await calendarRequestFn(event,'GET')).events||[]
  for(const change of audit.changes||[]){
    if(change.resource==='calendar:apple-family'){
      const reference=change.after||change.before
      const current=calendarRecord(remote,reference?.id||reference?.uid||reference?.sourceId)
      if(change.before===null&&change.after){
        if(current&&eventToken(current)===eventToken(change.after))pending.push(change)
        else if(!current&&mutationId){await calendarRequestFn(event,'DELETE',{...change.after,actionId:mutationId});restored.push(change.resource)}
        else throw Object.assign(new Error('A newer Family Calendar edit exists, so Undo recovery stopped.'),{code:'VERSION_CONFLICT'})
      }else if(change.before&&change.after){
        if(current&&eventToken(current)===eventToken(change.after))pending.push(change)
        else if(current&&current.actionId===mutationId&&sameCalendarValue(current,{...change.before,actionId:mutationId}))restored.push(change.resource)
        else throw Object.assign(new Error('A newer Family Calendar edit exists, so Undo recovery stopped.'),{code:'VERSION_CONFLICT'})
      }else if(change.before&&!change.after){
        if(!current)pending.push(change)
        else if(current.actionId===mutationId&&sameCalendarValue(current,{...change.before,actionId:mutationId}))restored.push(change.resource)
        else throw Object.assign(new Error('A newer Family Calendar edit exists, so Undo recovery stopped.'),{code:'VERSION_CONFLICT'})
      }
      continue
    }
    const current=await resources.read(change.resource)
    if(Number(current.version)===Number(change.afterVersion)){pending.push(change);continue}
    const recovered=Number(current.version)===Number(change.afterVersion)+1
      &&resourceLastActionId(change.resource,current)===mutationId
      &&sameResourceValue(change.resource,current.value,change.before)
    if(recovered){restored.push(change.resource);continue}
    throw Object.assign(new Error('A newer household edit exists, so Undo recovery stopped.'),{code:'VERSION_CONFLICT'})
  }
  return{pending,restored}
}

export async function undoActionWithJournal({repository,auditId,session,resources,event,calendarRequestFn=calendarRequest,now=()=>new Date(),leaseMs=15_000,createAttemptId=randomUUID}) {
  const journalId=actionId('undo',auditId)
  const undoAuditId=actionId('audit-undo',auditId)
  let {journal}=await repository.getJournalEntry(journalId)
  let originalAudit=journal?.originalAudit||null
  if(!journal){
    originalAudit=await repository.getAudit(auditId)
    if(!originalAudit)throw new Error('This completed Action Mode audit could not be found.')
    if(!originalAudit.undoAvailable||originalAudit.undoneAt)throw new Error('This action is not available to undo.')
    if(session.role!=='admin'&&originalAudit.actor!==session.member)throw Object.assign(new Error('Only the member who completed this action or an administrator can undo it.'),{code:'FORBIDDEN'})
  }
  if(journal&&journal.actor!==session.member&&session.role!=='admin')throw Object.assign(new Error('Only the member who started this Undo or an administrator can recover it.'),{code:'FORBIDDEN'})
  if(!originalAudit)throw new Error('This Undo recovery journal is missing its original immutable audit.')
  if(!journal||['prepared','mutating'].includes(journal.state)){
    const matrix=session.role==='admin'?null:await repository.getPermissions()
    await authorizeUndoOperations({event,audit:originalAudit,session,permissions:matrix?.[session.member],resources,calendarRequestFn})
  }
  if(!journal){
    const requestHash=fingerprint({auditId:originalAudit.id,actor:session.member,changes:originalAudit.changes})
    journal=await repository.ensureJournal({
      id:journalId,kind:'undo',subjectId:originalAudit.id,proposalId:originalAudit.proposalId,auditId:undoAuditId,
      originalAuditId:originalAudit.id,originalAudit,requestHash,state:'prepared',actor:session.member,
      summary:`Undo: ${originalAudit.summary}`,preparedAt:dateFromNow(now).toISOString(),
    })
  }
  if(['prepared','mutating'].includes(journal.state)){
    const attemptId=createAttemptId()
    journal=await claimJournalMutation({repository,journalId,now,leaseMs,attemptId})
    if(journal.state==='mutating'&&journal.mutationAttempt!==attemptId)throw journalInProgress()
    const recovery=await detectUndoRecovery({event,audit:journal.originalAudit,resources,calendarRequestFn,mutationId:journal.id})
    const newlyRestored=recovery.pending.length
      ?await undoAudit({event,audit:{...journal.originalAudit,changes:recovery.pending},session:{...session,member:journal.actor},permissions:null,resources,calendarRequestFn,mutationId:journal.id,authorizationChecked:true})
      :[]
    const restored=[...new Set([...recovery.restored,...newlyRestored])]
    const restoredAt=dateFromNow(now).toISOString()
    journal=await repository.updateJournal(journalId,current=>{
      if(['restored','audited','completed'].includes(current.state))return current
      if(current.state!=='mutating'||current.mutationAttempt!==attemptId)throw journalInProgress()
      return{...current,state:'restored',restored,restoredAt,leaseExpiresAt:null}
    })
  }
  let undoRecord=await repository.getAudit(journal.auditId)
  if(journal.state==='restored'){
    const completionHash=fingerprint({journalId:journal.id,restored:journal.restored,occurredAt:journal.restoredAt})
    undoRecord=await repository.addAudit({
      id:journal.auditId,journalId:journal.id,proposalId:journal.proposalId,summary:journal.summary,
      actor:journal.actor,action:'undo',status:'completed',occurredAt:journal.restoredAt,
      changes:[],restored:journal.restored,completionHash,undoAvailable:false,
    },{idempotent:true})
    journal=await repository.updateJournal(journalId,current=>['audited','completed'].includes(current.state)?current:{...current,state:'audited',auditedAt:undoRecord.occurredAt})
  }
  if(!undoRecord)undoRecord=await repository.getAudit(journal.auditId)
  if(!undoRecord)throw new Error('Action Mode could not recover the immutable audit for this Undo.')
  if(journal.state==='audited'){
    await repository.markAuditUndone(journal.originalAuditId,{undoneAt:undoRecord.occurredAt,undoneBy:journal.actor,undoAuditId:undoRecord.id})
    journal=await repository.updateJournal(journalId,current=>current.state==='completed'?current:{...current,state:'completed',completedAt:dateFromNow(now).toISOString()})
  }
  return{journal,audit:undoRecord}
}

export const handler=async event=>{
  const session=await readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to use Brevity Action Mode.'})
  const repository=productionAssistantActionRepository(),resources=createPermissionActionResources(repository,createProductionActionResources())
  try{
    const action=event.queryStringParameters?.action||'history'
    if(event.httpMethod==='GET'){
      const permissionState=await repository.getPermissionsState(),matrix=permissionState.permissions
      const history=(await repository.history()).filter(item=>session.role==='admin'||item.actor===session.member).map(publicAssistantAudit)
      return json(200,{history,permissions:matrix,permissionVersion:permissionState.version,role:session.role,member:session.member})
    }
    const body=parseBody(event);if(!body)return json(400,{error:'Invalid request body.'})
    if(event.httpMethod==='PUT'&&action==='permissions'){
      if(session.role!=='admin')return json(403,{error:'Household administrator access is required to change Action Mode permissions.'})
      const normalized=normalizePermissionMatrix(body.permissions)
      normalized.Larry={planning:true,calendar:true,projects:true,finance:true}
      if(body.confirmation!=='CONFIRM')return json(400,{error:'Type CONFIRM to authorize member permission changes.'})
      const result=await savePermissionsWithJournal({repository,matrix:normalized,session,expectedVersion:body.expectedVersion})
      return json(200,{permissions:result.permissions,permissionVersion:result.permissionVersion,audit:publicAssistantAudit(result.audit)})
    }
    if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
    if(action==='prepare-calendar'){
      const matrix=await repository.getPermissions()
      const remote=await calendarRequest(event,'GET')
      const proposal=await prepareCalendarProposal({input:body,session,permissions:matrix[session.member],events:remote.events||[],repository})
      return json(200,{proposal})
    }
    if(action==='prepare-meal'){
      const matrix=await repository.getPermissions()
      const mealRepository=await productionMealPlanRepository()
      const proposal=await prepareMealProposal({input:body,session,permissions:matrix[session.member],repository,mealRepository})
      return json(200,{proposal})
    }
    if(action==='prepare-sermon'){
      const matrix=await repository.getPermissions()
      const proposal=await prepareSermonProposal({input:body,session,permissions:matrix[session.member],repository,resources,sourceRepository:productionSermonSourceRepository()})
      return json(200,{proposal})
    }
    if(action==='prepare-direct'){
      const matrix=await repository.getPermissions()
      const proposal=await prepareDirectProposal({input:body,session,permissions:matrix[session.member],repository,resources})
      return json(200,{proposal})
    }
    if(action==='execute'){
      let proposalEntry=await repository.getProposalEntry(body.proposalId)
      let proposal=proposalEntry.proposal
      if(!proposal)return json(409,{error:'This proposal is no longer available. Ask Brevity to prepare a new one.'})
      if(proposal.actor!==session.member&&session.role!=='admin')return json(403,{error:'This proposal belongs to another household member.'})
      if(proposal.state==='executed'){
        const audit=await repository.getAudit(proposal.auditId)
        if(!audit)throw new Error('The completed Action Mode proposal is missing its immutable audit record.')
        const journalEntry=await repository.getJournalEntry(actionId('execute',proposal.id))
        if(journalEntry.journal&&journalEntry.journal.state!=='completed')await completeExecutionJournal({repository,journalId:journalEntry.journal.id,completedAt:proposal.executedAt||audit.occurredAt})
        return json(200,{ok:true,audit:publicAssistantAudit(audit),reloadRequired:true,recovered:true})
      }
      if(!['pending','executing'].includes(proposal.state))return json(409,{error:'This proposal cannot be applied again. Ask Brevity to prepare a new one.'})
      let operations,executingMember
      if(proposal.state==='pending'){
        if(new Date(proposal.expiresAt)<=new Date())return json(410,{error:'This proposal expired. Ask Brevity to prepare a current version.'})
        operations=proposal.operations.map(operation=>selectedOperation(operation,body.selections?.[operation.id]))
        assertExecutableProposalVersions(proposal,operations)
        const strong=proposal.risk==='strong-confirmation'||operations.some(operation=>operation.risk==='strong-confirmation')
        if(strong&&body.confirmation!=='CONFIRM')return json(400,{error:'Type CONFIRM to authorize this higher-impact change.'})
        if(!strong&&!body.confirmed)return json(400,{error:'Review and confirm the proposed changes before applying them.'})
        executingMember=session.member
        const started={...proposal,state:'executing',journalVersion:1,selectedOperations:operations,startedAt:new Date().toISOString(),startedBy:executingMember,startedRole:session.role,confirmationMode:strong?'strong-confirmation':'confirmation'}
        const claim=await repository.saveProposalState(started,{onlyIfMatch:proposalEntry.etag})
        if(!claim.modified)return json(409,{error:'This proposal was already claimed or changed. Retry to recover its current state.'})
        proposal=started
      }else{
        if(proposal.journalVersion!==1||!Array.isArray(proposal.selectedOperations)||!['admin','member'].includes(proposal.startedRole))return json(409,{error:'This older in-progress proposal cannot be recovered automatically. Review household data and prepare a new proposal.'})
        executingMember=proposal.startedBy
        if(executingMember!==session.member&&session.role!=='admin')return json(403,{error:'Only the member who started this action or an administrator can recover it.'})
        operations=proposal.selectedOperations
      }
      const matrix=await repository.getPermissions(),executionSession=reviewedExecutionSession(session,proposal),permissions=matrix[executingMember]
      try{
        const result=await executeActionWithJournal({repository,proposal,operations,session:executionSession,permissions,resources,event})
        proposalEntry=await repository.getProposalEntry(proposal.id)
        const completed={...proposalEntry.proposal,state:'executed',executedAt:result.audit.occurredAt,auditId:result.audit.id}
        const saved=await repository.saveProposalState(completed,{onlyIfMatch:proposalEntry.etag})
        if(!saved.modified){
          const latest=(await repository.getProposalEntry(proposal.id)).proposal
          if(latest?.state!=='executed'||latest.auditId!==result.audit.id)throw Object.assign(new Error('The proposal state changed while Action Mode was finalizing it.'),{code:'JOURNAL_CONFLICT'})
        }
        await completeExecutionJournal({repository,journalId:result.journal.id,completedAt:result.audit.occurredAt})
        return json(200,{ok:true,audit:publicAssistantAudit(result.audit),reloadRequired:true})
      }catch(error){
        const journal=(await repository.getJournalEntry(actionId('execute',proposal.id))).journal
        if(!journal){
          const latest=await repository.getProposalEntry(proposal.id)
          if(latest.proposal?.state==='executing')await repository.saveProposalState({...latest.proposal,state:'failed',failedAt:new Date().toISOString(),failure:error.message},{onlyIfMatch:latest.etag}).catch(()=>{})
        }
        throw error
      }
    }
    if(action==='undo'){
      if(body.confirmation!=='CONFIRM')return json(400,{error:'Type CONFIRM to undo this completed action.'})
      const result=await undoActionWithJournal({repository,auditId:body.auditId,session,resources,event})
      return json(200,{ok:true,audit:publicAssistantAudit(result.audit),reloadRequired:true})
    }
    return json(404,{error:'Unknown Action Mode request.'})
  }catch(error){
    console.error('[brevity-assistant-actions]',error)
    if(error.code==='FORBIDDEN')return json(403,{error:error.message})
    if(['VERSION_CONFLICT','JOURNAL_CONFLICT','ACTION_IN_PROGRESS'].includes(error.code))return json(409,{error:error.message})
    if(error.code==='INVALID_ACTION')return json(422,{error:error.message})
    return json(500,{error:error.message||'Brevity Action Mode is temporarily unavailable.'})
  }
}

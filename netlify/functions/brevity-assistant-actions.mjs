import householdAuth from './household-auth.js'
import { normalizePermissionMatrix, permissionForOperation, selectedOperation } from '../lib/assistant-action-contract.mjs'
import { productionAssistantActionRepository } from '../lib/assistant-action-repository.mjs'
import { createProductionActionResources, executeRecordOperations } from '../lib/assistant-action-executor.mjs'

const { readSession } = householdAuth
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const parseBody=event=>{try{return JSON.parse(event.body||'{}')}catch{return null}}
export const publicAssistantAudit=audit=>({
  id:audit.id,proposalId:audit.proposalId,summary:audit.summary,actor:audit.actor,
  action:audit.action,status:audit.status,occurredAt:audit.occurredAt,
  undoAvailable:Boolean(audit.undoAvailable),undoneAt:audit.undoneAt||null,undoneBy:audit.undoneBy||null,
  operations:(audit.operations||[]).map(({id,type,domain,description,selectedScope})=>({id,type,domain,description,selectedScope})),
})

async function calendarRequest(event, method, body) {
  const host=event.headers?.host||event.headers?.Host
  if(!host)throw new Error('Brevity could not resolve the Family Calendar endpoint.')
  const response=await fetch(`https://${host}/.netlify/functions/icloud-calendar`,{method,headers:{cookie:event.headers?.cookie||event.headers?.Cookie||'','content-type':'application/json'},body:body?JSON.stringify(body):undefined})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(payload.error||`Family Calendar action failed (${response.status}).`)
  return payload
}

async function executeCalendarOperations({event,operations,session,permissions}) {
  const selected=operations.filter(operation=>operation.type.startsWith('calendar.'))
  if(!selected.length)return[]
  const remote=await calendarRequest(event,'GET')
  const changes=[]
  for(const operation of selected){
    const current=(remote.events||[]).find(item=>[item.id,item.uid,item.sourceId].includes(operation.targetId))||null
    const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions,currentRecord:current})
    if(!permission.allowed)throw Object.assign(new Error(permission.reason),{code:'FORBIDDEN'})
    if(operation.type!=='calendar.create'&&!current)throw new Error('That Family Calendar event no longer exists. Refresh and ask again.')
    if(operation.type!=='calendar.create'&&String(current.id||'').includes('::'))throw new Error('Recurring Apple Calendar occurrences must currently be changed in Apple Calendar so Brevity does not damage the series.')
    if(operation.type==='calendar.create'){
      const candidate={sourceId:`assistant-${operation.id}`,title:operation.payload.title||operation.description,date:operation.payload.date||operation.targetDate,time:operation.payload.time||'',allDay:operation.payload.allDay!==false,pillar:'household',owner:operation.payload.owner||session.member,participants:operation.payload.participants||[],priority:operation.payload.priority==='high'}
      const created=await calendarRequest(event,'POST',candidate);changes.push({resource:'calendar:apple-family',before:null,after:{...candidate,...created}})
    }else if(operation.type==='calendar.update'){
      const candidate={...current,...operation.payload,id:current.uid||current.id,href:current.href,etag:current.etag}
      const updated=await calendarRequest(event,'PUT',candidate);changes.push({resource:'calendar:apple-family',before:current,after:{...candidate,...updated}})
    }else{
      await calendarRequest(event,'DELETE',current);changes.push({resource:'calendar:apple-family',before:current,after:null})
    }
  }
  return changes
}

async function undoAudit({event,audit,session,resources}) {
  if(!audit?.undoAvailable||audit.undoneAt)throw new Error('This action is not available to undo.')
  if(session.role!=='admin'&&audit.actor!==session.member)throw Object.assign(new Error('Only the member who completed this action or an administrator can undo it.'),{code:'FORBIDDEN'})
  const preflight=new Map()
  for(const change of audit.changes||[]){
    if(change.resource==='calendar:apple-family')continue
    const current=await resources.read(change.resource)
    if(Number(current.version)!==Number(change.afterVersion))throw Object.assign(new Error('A newer household edit exists, so Undo was stopped to protect it.'),{code:'VERSION_CONFLICT'})
    preflight.set(change.resource,current)
  }
  const restored=[]
  for(const change of [...(audit.changes||[])].reverse()){
    if(change.resource==='calendar:apple-family'){
      if(change.before===null&&change.after)await calendarRequest(event,'DELETE',change.after)
      else if(change.before&&change.after)await calendarRequest(event,'PUT',{...change.before,id:change.before.uid||change.before.id})
      else if(change.before&&!change.after)await calendarRequest(event,'POST',change.before)
      restored.push(change.resource);continue
    }
    const current=preflight.get(change.resource)
    await resources.write(change.resource,change.before,current.version,`Undo by ${session.member}`);restored.push(change.resource)
  }
  return restored
}

export const handler=async event=>{
  const session=await readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to use Brevity Action Mode.'})
  const repository=productionAssistantActionRepository(),resources=createProductionActionResources()
  try{
    const action=event.queryStringParameters?.action||'history'
    if(event.httpMethod==='GET'){
      const matrix=await repository.getPermissions()
      const history=(await repository.history()).filter(item=>session.role==='admin'||item.actor===session.member).map(publicAssistantAudit)
      return json(200,{history,permissions:matrix,role:session.role,member:session.member})
    }
    const body=parseBody(event);if(!body)return json(400,{error:'Invalid request body.'})
    if(event.httpMethod==='PUT'&&action==='permissions'){
      if(session.role!=='admin')return json(403,{error:'Household administrator access is required to change Action Mode permissions.'})
      const normalized=normalizePermissionMatrix(body.permissions)
      normalized.Larry={planning:true,calendar:true,projects:true,finance:true}
      return json(200,{permissions:await repository.savePermissions(normalized,session.member)})
    }
    if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
    if(action==='execute'){
      const proposal=await repository.getProposal(body.proposalId)
      if(!proposal||proposal.state!=='pending')return json(409,{error:'This proposal is no longer pending. Ask Brevity to prepare a new one.'})
      if(proposal.actor!==session.member&&session.role!=='admin')return json(403,{error:'This proposal belongs to another household member.'})
      if(new Date(proposal.expiresAt)<=new Date())return json(410,{error:'This proposal expired. Ask Brevity to prepare a current version.'})
      const operations=proposal.operations.map(operation=>selectedOperation(operation,body.selections?.[operation.id]))
      const strong=proposal.risk==='strong-confirmation'||operations.some(operation=>operation.risk==='strong-confirmation')
      if(strong&&body.confirmation!=='CONFIRM')return json(400,{error:'Type CONFIRM to authorize this higher-impact change.'})
      if(!strong&&!body.confirmed)return json(400,{error:'Review and confirm the proposed changes before applying them.'})
      const matrix=await repository.getPermissions(),permissions=matrix[session.member]
      const started={...proposal,state:'executing',startedAt:new Date().toISOString(),startedBy:session.member}
      await repository.saveProposalState(started)
      try{
        const recordResult=await executeRecordOperations({proposal:{...proposal,operations},selections:body.selections||{},session,permissions,resources})
        const calendarChanges=await executeCalendarOperations({event,operations,session,permissions})
        const changes=[...recordResult.changes,...calendarChanges]
        const audit=await repository.addAudit({proposalId:proposal.id,summary:proposal.summary,actor:session.member,action:'execute',status:'completed',operations,changes,undoAvailable:true})
        await repository.saveProposalState({...started,state:'executed',executedAt:audit.occurredAt,auditId:audit.id})
      return json(200,{ok:true,audit:publicAssistantAudit(audit),reloadRequired:true})
      }catch(error){
        await repository.saveProposalState({...started,state:'failed',failedAt:new Date().toISOString(),failure:error.message}).catch(()=>{})
        throw error
      }
    }
    if(action==='undo'){
      if(body.confirmation!=='CONFIRM')return json(400,{error:'Type CONFIRM to undo this completed action.'})
      const history=await repository.history(),audit=history.find(item=>item.id===body.auditId)
      const restored=await undoAudit({event,audit,session,resources})
      const undoRecord=await repository.addAudit({proposalId:audit.proposalId,summary:`Undo: ${audit.summary}`,actor:session.member,action:'undo',status:'completed',changes:[],restored,undoAvailable:false})
      const updated={...audit,undoAvailable:false,undoneAt:undoRecord.occurredAt,undoneBy:session.member}
      const remaining=(await repository.history()).map(item=>item.id===audit.id?updated:item)
      await repository.replaceHistory(remaining)
      return json(200,{ok:true,audit:publicAssistantAudit(undoRecord),reloadRequired:true})
    }
    return json(404,{error:'Unknown Action Mode request.'})
  }catch(error){
    console.error('[brevity-assistant-actions]',error)
    if(error.code==='FORBIDDEN')return json(403,{error:error.message})
    if(error.code==='VERSION_CONFLICT')return json(409,{error:error.message})
    return json(500,{error:error.message||'Brevity Action Mode is temporarily unavailable.'})
  }
}

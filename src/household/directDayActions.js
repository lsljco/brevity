import {prepareDirectAction,executeAssistantProposal,undoAssistantAction} from '../assistant/assistantApi.js'
import {publishActionCompleted} from '../assistant/actionEvents.js'
import {outcomesOperation,savedDayOutcomes} from './dayOutcomes.js'
import {rescheduleOpenWork} from './openWork.js'

export const canUpdateDayItem=item=>['assignment','priority'].includes(item.sourceKind)&&Boolean(item.id)&&!(item.sourceRecords?.length>1)
export function dayItemChange(plan,item,patch){
 if(!canUpdateDayItem(item))throw Error('Open this responsibility in its source to preserve its approval rules.')
 const allowed=['status','date','notes']
 if(Object.keys(patch).some(key=>!allowed.includes(key)))throw Error('Unsupported direct task change.')
 if(patch.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(patch.date)||new Date(patch.date+'T12:00:00Z').toISOString().slice(0,10)!==patch.date))throw Error('Choose a valid date.')
 if(item.operation&&item.source){
  const operation=patch.date?rescheduleOpenWork(item,patch.date):structuredClone(item.operation)
  if(item.source.kind==='assignment')operation.payload={...patch}
  else operation.payload.patch.priorities=operation.payload.patch.priorities.map(row=>row.id===item.source.id?{...row,...patch}:row)
  operation.description=`Update ${item.title}`
  return {operation,expectedVersion:item.expectedVersion}
 }
 if(item.sourceDate&&item.sourceDate!==plan.date)throw Error('Refresh the original dated task before changing it.')
 if(item.sourceKind==='assignment'){
  if(!plan.assignments?.some(row=>row.id===item.id))throw Error('This assignment changed. Refresh before trying again.')
  return {operation:{type:'assignment.update',targetDate:plan.date,targetId:item.id,payload:patch,description:`Update ${item.title}`},expectedVersion:plan.version}
 }
 const rows=savedDayOutcomes(plan)
 if(!rows.some(row=>row.id===item.id))throw Error('This outcome changed. Refresh before trying again.')
 return {operation:outcomesOperation(plan,rows.map(row=>row.id===item.id?{...row,...patch}:row)),expectedVersion:plan.version}
}
// Keep one prepared proposal through retries, including a lost execute response.
// A direct click supplies consent for this exact narrow edit, not an AI instruction.
export function createDaySave(request,api={prepare:prepareDirectAction,execute:executeAssistantProposal}){
 let proposal
 return async()=>{
  if(!proposal){const result=await api.prepare({...request,summary:request.operation.description});proposal=result.proposal;if(!proposal?.id)throw Error('The change could not be prepared.')}
  if(proposal.risk==='strong-confirmation'||proposal.operations.some(op=>op.risk==='strong-confirmation'))throw Error('This change requires the full source review.')
  const result=await api.execute({proposalId:proposal.id,confirmed:true,selections:Object.fromEntries(proposal.operations.map(op=>[op.id,'this-item']))})
  publishActionCompleted({proposalId:proposal.id,audit:result.audit})
  return result.audit
 }
}
export async function undoDaySave(audit){const result=await undoAssistantAction({auditId:audit.id,confirmation:'CONFIRM'});publishActionCompleted({audit:result.audit});return result}

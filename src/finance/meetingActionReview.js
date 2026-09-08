import { prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import { getAcknowledgedSharedStateVersion } from '../household/sharedState.js'
import { canonicalMeetingAction, canonicalMeetingCorrection, canonicalMeetingHistory, canonicalMeetingNameText } from './meetingNames.js'

export const FINANCE_MEETINGS_STORAGE_KEY='brevity_finance_meetings_v1'

const same=(left,right)=>JSON.stringify(left??'')===JSON.stringify(right??'')
const quote=value=>`“${String(value||'').trim().slice(0,80)}${String(value||'').trim().length>80?'…':''}”`

function changedPayload(before,draft,fields){
  return Object.fromEntries(fields.flatMap(field=>same(before?.[field],draft?.[field])?[]:[[field,draft?.[field]??'']]))
}

function requireChange(payload){
  if(!Object.keys(payload).length)throw new Error('Change at least one field before requesting review.')
  return payload
}

export function meetingActionOperation(before,draft){
  const next=canonicalMeetingAction({
    ...draft,
    due:draft?.due||'',
    status:draft?.status||before?.status||'open',
  })
  next.text=next.text.trim();next.owner=next.owner.trim();next.financialEffect=next.financialEffect.trim()
  if(!next.text)throw new Error('Commitment text is required.')
  const payload=requireChange(changedPayload(before,next,['text','owner','due','status']))
  return{
    type:'meeting.action.update',targetId:before.id,payload,
    description:`Update Finance Meeting commitment ${quote(before.text)}.`,
  }
}

export function meetingActionCreateOperation(draft,{cadence='weekly',date}={}){
  const repaired=canonicalMeetingAction(draft),text=repaired.text.trim(),owner=repaired.owner.trim()
  if(!text)throw new Error('Commitment text is required.')
  return{
    type:'meeting.action.create',
    payload:{text,owner,due:draft?.due||'',financialEffect:repaired.financialEffect.trim(),meetingDate:date||'',cadence,status:'open'},
    description:`Add Finance Meeting commitment ${quote(text)}.`,
  }
}

export function meetingCorrectionOperation(before,draft){
  const next=canonicalMeetingCorrection({
    ...draft,
    source:draft?.source||before?.source||'Proposed',
    scope:draft?.scope||before?.scope||'this occurrence',
    status:draft?.status||before?.status||'proposed',
  })
  next.label=next.label.trim();next.reason=next.reason.trim();next.origin=next.origin.trim()
  if(!next.label)throw new Error('Correction name is required.')
  const payload=requireChange(changedPayload(before,next,['label','value','reason','source','scope','status','origin']))
  return{
    type:'meeting.correction.update',targetId:before.id,payload,
    description:`Update proposed financial correction ${quote(before.label)}.`,
  }
}

export function meetingCorrectionCreateOperation(draft,{cadence='weekly',date,origin='manually entered'}={}){
  const repaired=canonicalMeetingCorrection({...draft,origin:draft?.origin||origin}),label=repaired.label.trim()
  if(!label)throw new Error('Correction name is required.')
  if(draft?.value==null||draft.value==='')throw new Error('Correction value is required.')
  return{
    type:'meeting.correction.create',
    payload:{
      label,value:repaired.value,reason:repaired.reason.trim(),source:draft?.source||'User Confirmed',
      scope:draft?.scope||'this occurrence',status:'proposed',origin:repaired.origin.trim(),meetingDate:date||'',cadence,
    },
    description:`Stage proposed financial correction ${quote(label)}.`,
  }
}

export function meetingHistoryOperation(before,draft){
  const next=canonicalMeetingHistory({...draft,summary:draft?.summary||'',notes:draft?.notes||'',transcript:draft?.transcript||''})
  const payload=requireChange(changedPayload(before,next,['summary','notes','transcript']))
  return{
    type:'meeting.history.update',targetId:before.id,payload,
    description:`Update the saved ${before.cadence||'finance'} Finance Meeting record.`,
  }
}

export function meetingSessionCreateOperation({cadence='weekly',meetingDate='',startedAt='',endedAt='',summary='',notes='',transcript='',actions=[],corrections=[]}={}){
  const normalizedActions=actions.flatMap(item=>{
    const repaired=canonicalMeetingAction(item),text=repaired.text.trim()
    if(!text)return[]
    return[{text,owner:repaired.owner.trim(),due:item?.due||'',financialEffect:repaired.financialEffect.trim()}]
  })
  const normalizedCorrections=corrections.flatMap(item=>{
    const repaired=canonicalMeetingCorrection(item),label=repaired.label.trim()
    if(!label||item?.value==null||item.value==='')return[]
    return[{label,value:repaired.value,reason:repaired.reason.trim(),source:item?.source||'Proposed',scope:item?.scope||'this occurrence',origin:repaired.origin.trim()||'meeting transcript analysis'}]
  })
  if(!String(summary||notes||transcript).trim()&&!normalizedActions.length&&!normalizedCorrections.length)throw new Error('Capture meeting notes, a transcript, or at least one proposed update before requesting review.')
  const reviewedDetails=[
    normalizedActions.length?` Commitments: ${normalizedActions.map(item=>quote(item.text)).join('; ')}.`:'',
    normalizedCorrections.length?` Corrections: ${normalizedCorrections.map(item=>quote(item.label)).join('; ')}.`:'',
  ].join('')
  return{
    type:'meeting.session.create',
    payload:{cadence,meetingDate,startedAt,endedAt,summary:canonicalMeetingNameText(summary),notes:canonicalMeetingNameText(notes),transcript:canonicalMeetingNameText(transcript),actions:normalizedActions,corrections:normalizedCorrections},
    description:`Save the reviewed ${cadence} Finance Meeting with ${normalizedActions.length} commitment${normalizedActions.length===1?'':'s'} and ${normalizedCorrections.length} proposed correction${normalizedCorrections.length===1?'':'s'}.${reviewedDetails}`,
  }
}

export function meetingWorkspaceOperation(change){
  if(change?.kind==='month-status')return{type:'meeting.workspace.update',targetId:'snapshot',payload:{monthStatus:change.value},description:`Set the Finance Meeting month status to ${change.value}.`}
  if(change?.kind==='expense-focus')return{type:'meeting.workspace.update',targetId:'snapshot',payload:{expenseFocus:canonicalMeetingNameText(change.value).trim()},description:'Update the Finance Meeting recurring-expense focus.'}
  if(change?.kind==='cadence-note')return{type:'meeting.workspace.update',targetId:'cadence-notes',payload:{cadence:change.cadence,noteIndex:change.index,note:canonicalMeetingNameText(change.value)},description:`Update the ${change.cadence} Finance Meeting ${Number(change.index)+1} decision note.`}
  throw new Error('That Finance Meeting workspace change is not supported.')
}

export async function requestMeetingActionReview({summary,operation,storage=localStorage}){
  const expectedVersion=getAcknowledgedSharedStateVersion(storage,FINANCE_MEETINGS_STORAGE_KEY)
  const result=await prepareDirectAction({summary,operation,expectedVersion})
  if(!result?.proposal?.id)throw new Error('Action Mode did not return a reviewable Finance Meeting proposal.')
  requestActionReview(result.proposal)
  return result.proposal
}

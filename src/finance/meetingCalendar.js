export const FINANCE_MEETINGS_KEY='brevity_finance_meetings_v1'

const clean=value=>String(value||'').trim()
const isoToday=()=>new Date().toISOString().slice(0,10)

export function meetingActionCalendarEvent(action={}){
  action=canonicalMeetingAction(action)
  const date=clean(action.due)||clean(action.meetingDate)||isoToday()
  const owner=clean(action.owner)||'Family'
  const participants=owner==='Family'?['Family']:[owner]
  return{
    id:`finance-action-${action.id}`,
    sourceId:`finance-action-${action.id}`,
    source:'finance-meeting',
    title:clean(action.text)||'Finance meeting commitment',
    date,
    start:date,
    end:date,
    allDay:true,
    owner,
    members:participants,
    participants,
    calendarName:'Family',
    calendarSyncEnabled:false,
    status:action.status||'open',
    priority:'normal',
    notes:action.due?'Derived from the authoritative Finance Meeting commitment.':'Derived from a Finance Meeting commitment with no explicit due date; shown on the meeting date.',
    updatedAt:action.updatedAt||action.createdAt||'',
  }
}

// Finance Meeting commitments have one authoritative record. Family Calendar
// derives these entries at read time instead of maintaining a second mutable
// copy that can drift after an edit, completion, or Undo.
export function meetingActionsCalendarEvents(storage=localStorage){
  let workspace
  try{workspace=JSON.parse(storage?.getItem(FINANCE_MEETINGS_KEY)||'{}')}catch{return[]}
  return (Array.isArray(workspace?.openActions)?workspace.openActions:[])
    .filter(action=>action?.id&&clean(action.text)&&action.status!=='done')
    .map(meetingActionCalendarEvent)
}

export function isLegacyMeetingCalendarCopy(event={}){
  return event.source==='finance-meeting'||String(event.id||event.sourceId||'').startsWith('finance-action-')
}
import { canonicalMeetingAction } from './meetingNames.js'

import { FAMILY_CALENDAR_KEY, readJson, writeJson } from '../homehq/projectData.js'

const clean=value=>String(value||'').trim()
const isoToday=()=>new Date().toISOString().slice(0,10)

export function meetingActionCalendarEvent(action={}){
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
    calendarSyncEnabled:true,
    status:action.status||'open',
    priority:'normal',
    notes:action.due?'Created from a Finance Meeting assignment.':'Created from a Finance Meeting assignment with no explicit due date; placed on the meeting date.',
    updatedAt:new Date().toISOString(),
  }
}

export function syncMeetingActionToCalendar(storage,action){
  if(!action?.id||!clean(action.text))return{ok:false,error:new Error('A valid finance meeting action is required.')}
  const existing=readJson(storage,FAMILY_CALENDAR_KEY,[])
  const events=Array.isArray(existing)?existing:[]
  const nextEvent=meetingActionCalendarEvent(action)
  const next=[...events.filter(event=>event.id!==nextEvent.id),nextEvent]
  const result=writeJson(storage,FAMILY_CALENDAR_KEY,next)
  if(result.ok&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('brevity-family-calendar-updated',{detail:next}))
  return{...result,event:nextEvent,events:next}
}

import {matchesCalendarScopes} from '../family/calendarScopes.js'
// Today is a shared plan plus the viewer's calendar, not an all-member feed.
// Unknown Apple ownership stays in the full calendar for source review.
export function todayCalendarAppointments(appointments,member,scope='mine'){
 return appointments.filter(event=>{
  const apple=event.source==='icloud'||event.calendarSource==='icloud'||Boolean(event.appleCalendarId)
  if(event.ownershipKnown===false)return false
  if(apple&&!event.appleCalendarOwner&&!(event.appleCalendarId&&event.owner&&event.owner!=='Family'))return false
  return matchesCalendarScopes(event,scope==='household'?['Family']:['Family',member])
 })
}

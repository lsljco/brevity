import {isPersonalItem} from './todayPresentation.js'
import {matchesCalendarScopes} from '../family/calendarScopes.js'
// Today scope controls its agenda; full calendar source filters remain independent.
// Unknown Apple ownership stays in the full calendar for source review.
export function todayCalendarAppointments(appointments,member,scope='mine'){
 return appointments.filter(event=>{
  const apple=event.source==='icloud'||event.calendarSource==='icloud'||Boolean(event.appleCalendarId)
  if(event.ownershipKnown===false)return false
  if(apple&&!event.appleCalendarOwner&&!(event.appleCalendarId&&event.owner&&event.owner!=='Family'))return false
  if(scope==='household')return true
  if(apple&&event.appleCalendarOwner===member)return true
  return isPersonalItem(event,member)&&matchesCalendarScopes(event,['Family',member])
 })
}

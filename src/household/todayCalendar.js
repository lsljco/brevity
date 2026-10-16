import {isPersonalItem} from './todayPresentation.js'
import {namedFor} from './dailyRhythm.js'
// Today scope controls its agenda; full calendar source filters remain independent.
// Explicit responsibility wins over the calendar containing an event.
export function todayCalendarAppointments(appointments,member,scope='mine'){
 return appointments.filter(event=>{
  const apple=event.source==='icloud'||event.calendarSource==='icloud'||Boolean(event.appleCalendarId)
  if(event.ownershipKnown===false)return false
  if(apple&&!event.appleCalendarOwner&&!(event.appleCalendarId&&event.owner&&event.owner!=='Family'))return false
  if(scope==='household')return true
  if(namedFor(event,member)||event.members?.includes(member))return true
  if(event.owner&&!['Family','Everyone'].includes(event.owner))return false
  if(apple&&event.appleCalendarOwner===member)return true
  if(event.participants?.length||event.members?.length||event.owners?.some(x=>!['Everyone','Family'].includes(x)))return false
  if(apple&&event.appleCalendarOwner&&event.appleCalendarOwner!=='Family')return false
  return isPersonalItem(event,member)
 })
}

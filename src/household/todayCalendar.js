import {isPersonalItem} from './todayPresentation.js'
import {HOUSEHOLD_MEMBERS} from './dailyPlan.js'
// Today scope controls its agenda; full calendar source filters remain independent.
// Household follows the calendar source; My day follows explicit responsibility.
export function todayCalendarAppointments(appointments,member,scope='mine'){
 return appointments.filter(event=>{
  const apple=event.source==='icloud'||event.calendarSource==='icloud'||Boolean(event.appleCalendarId)
  if(scope==='household'&&apple)return event.appleCalendarOwner==='Family'
  if(event.ownershipKnown===false)return false
  if(apple&&!event.appleCalendarOwner&&!(event.appleCalendarId&&event.owner&&event.owner!=='Family'))return false
  if(scope==='household')return event.owner==='Family'||event.calendarScope==='family'
  const participants=[...(event.participants||[]),...(event.members||[])]
  const wholeHousehold=participants.includes('Everyone')||participants.includes('Family')||HOUSEHOLD_MEMBERS.every(name=>participants.includes(name))
  if(event.owner===member||event.owners?.includes(member)||(!wholeHousehold&&participants.includes(member)))return true
  if(event.owner&&!['Family','Everyone'].includes(event.owner))return false
  if(apple&&event.appleCalendarOwner===member)return true
  if(event.participants?.length||event.members?.length||event.owners?.some(x=>!['Everyone','Family'].includes(x)))return false
  if(apple&&event.appleCalendarOwner&&event.appleCalendarOwner!=='Family')return false
  return isPersonalItem(event,member)
 })
}

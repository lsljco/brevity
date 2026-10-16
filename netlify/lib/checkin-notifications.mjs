import {householdClock} from '../../src/household/dailyRhythm.js'
import {CHECKIN_URL,isThursday,checkinStatus} from '../../src/household/householdCheckin.js'
import {inQuietHours,reminderPreferences} from './personal-reminders.mjs'
export function dueCheckinMessages({record,source,preferences={},role,now=new Date()}){
 const {date,minute}=householdClock(now)
 if(source.date!==date||inQuietHours(reminderPreferences(preferences),minute))return []
 const status=checkinStatus(record,source.revision,minute),messages=[]
 if(status!=='Submitted'){
  if(minute>=840&&minute<930)messages.push({key:`checkin:${date}`,title:'Brevity · Your daily household check-in',body:`Review today’s commitments and focus, then name your three priorities for tomorrow. Submit by 4 p.m. Eastern.${isThursday(date)?' Include weekend outings, rest, fellowship, availability and pillar updates for Friday’s Welcome Weekend Warrior.':''}`,url:CHECKIN_URL,tag:`checkin-${date}`,remaining:120})
  if(minute>=930&&minute<1020)messages.push({key:`checkin-reminder:${date}`,title:'Brevity · Your check-in is still needed',body:'Your own update is due at 4 p.m. Eastern for the 5 p.m. meeting. Review progress, blockers and tomorrow’s three priorities.',url:CHECKIN_URL,tag:`checkin-reminder-${date}`,remaining:90})
 }
 if(role==='admin'&&minute>=1005&&minute<1080)messages.push({key:`checkin-meeting:${date}`,title:'Brevity · Household meeting brief',body:'Review submitted updates, missing responses and proposed shared priorities before the 5 p.m. meeting.',url:CHECKIN_URL,tag:`checkin-meeting-${date}`,remaining:75})
 return messages
}

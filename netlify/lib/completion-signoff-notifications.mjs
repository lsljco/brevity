import {completionSignoffs} from '../../src/notifications/completionSignoffs.js'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {inQuietHours,reminderPreferences} from './personal-reminders.mjs'
import {sendBriefingOnce,reminderMessageId} from './daily-briefing-delivery.mjs'
export async function dispatchSignoffNotifications({chores,projects,devices,store,root,keys,deliver,now=new Date()}){
 let sent=0
 for(const device of devices.filter(device=>device&&['Larry','Terica'].includes(device.member))){
  if(inQuietHours(reminderPreferences(device.preferences||{}),householdClock(now).minute))continue
  for(const item of completionSignoffs({chores,projects,member:device.member})){
   const identity=reminderMessageId([item.kind,item.id,item.submittedAt])
   const message={title:'Brevity · Sign-off requested',body:`${item.submittedBy||'A household member'} submitted a ${item.kind} for review. Open Brevity to approve or return it.`,url:'/?signoffs=1',tag:`signoff-${identity}`,remaining:1440}
   if(await sendBriefingOnce({store,key:`${root}signoffs-sent/${device.id}/${identity}`,device:{...device,root},message,keys,deliver,now}))sent++
  }
 }
 return {sent}
}

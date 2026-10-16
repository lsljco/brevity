import '../lib/native-runtime.mjs'
import {HOUSEHOLD_MEMBERS} from '../../src/homehq/projectData.js'
import {buildDailyResponsibilities} from '../../src/household/dailyResponsibilities.js'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {reminderStore,reminderRoot,vapidKeys,deliverReminder} from '../lib/personal-reminders.mjs'
import {briefingStore,loadDailyBriefingInputs,memberRole,financeBriefAllowed} from '../lib/daily-briefing-source.mjs'
import {dailyPrioritiesNotification} from '../lib/daily-priorities-notification.mjs'
import {dailyFinancialBrief} from '../lib/daily-financial-brief.mjs'
import {dueBriefingMessages,sendBriefingOnce,reminderMessageId} from '../lib/daily-briefing-delivery.mjs'
import {dueCheckinMessages} from '../lib/checkin-notifications.mjs'
import {checkinKey,checkinSource} from '../lib/household-checkins.mjs'
export default async function handler(){
 const store=reminderStore(),root=reminderRoot(),state=briefingStore(),now=new Date(),date=householdClock(now).date
 const devices=[]
 for await(const page of store.list({prefix:`${root}devices/`,paginate:true}))for(const row of page.blobs){const device=await store.get(row.key,{type:'json'});if(device&&HOUSEHOLD_MEMBERS.includes(device.member))devices.push({...device,root})}
 if(!devices.length)return
 const input=await loadDailyBriefingInputs(date,{now}),keys=await vapidKeys(store)
 for(const member of new Set(devices.map(device=>device.member))){
  const role=await memberRole(member);if(!role)continue
  const saved=await state.get(`${root}days/${date}/${member}`,{type:'json'})||{}
  const brief=buildDailyResponsibilities(input,member,now,saved.reports),finance=financeBriefAllowed(member,role,input.permissions)?dailyFinancialBrief(input):null
  const checkin=await state.get(checkinKey(date,member),{type:'json'}),source=checkinSource(input,member,now)
  for(const device of devices.filter(device=>device.member===member)){
   const previous=await state.get(`${root}observed/${device.id}/${date}`,{type:'json'})
   const {messages,snapshot}=dueBriefingMessages({brief,finance,preferences:device.preferences,previous:previous?.snapshot,morning:dailyPrioritiesNotification(input,member,now),now})
   messages.push(...dueCheckinMessages({record:checkin,source,preferences:device.preferences,role,now}))
   let changesSent=true
   for(const message of messages){const sent=await sendBriefingOnce({store,key:`${root}sent/${device.id}/${reminderMessageId(message.key)}`,device,message,keys,deliver:deliverReminder,now});if(message.key.startsWith('changes:')&&!sent)changesSent=false}
   if(snapshot&&changesSent&&Object.values(brief.sources).every(value=>value!=='unavailable'))await state.setJSON(`${root}observed/${device.id}/${date}`,{snapshot,updatedAt:now.toISOString()})
  }
 }
}
export const config={schedule:'* * * * *'}

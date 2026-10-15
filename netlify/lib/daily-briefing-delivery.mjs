import {createHash} from 'node:crypto'
import {householdClock,minuteOfDay} from '../../src/household/dailyRhythm.js'
import {inQuietHours,reminderPreferences} from './personal-reminders.mjs'
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const url='/?briefing=1#daily-briefing'
export function dueBriefingMessages({brief,finance,preferences={},previous,morning,now=new Date()}){
 const prefs=reminderPreferences(preferences),clock=householdClock(now),date=brief.date,items=brief.items
 const snapshot=Object.fromEntries(items.map(item=>[item.id,hash([item.title,item.time,item.endTime,item.owners])]))
 if(clock.date!==date||inQuietHours(prefs,clock.minute))return {messages:[],snapshot:null}
 const messages=[]
 const dailyStart=minuteOfDay(prefs.dailyBriefingTime)
 if(clock.minute>=dailyStart){
  if(prefs.dailyBriefing)messages.push({key:`daily:${date}`,title:morning?.title||`Brevity · Your day, ${brief.member}`,body:morning?.body||'Let’s set today’s priorities. Open Brevity → Today',url:morning?.url||'/?priorities=1#today-focus',tag:`briefing-${date}`,remaining:Math.min(240,1440-clock.minute)})
  if(finance&&prefs.financialBriefing&&!prefs.dailyBriefing)messages.push({key:`finance:${date}`,title:'Brevity · Daily financial analysis',body:`Your operating and savings balances, month-end forecast, ${finance.bills.filter(item=>item.status!=='Posted').length} unposted bills and ${finance.tasks.length} financial tasks are ready. Open your secure briefing.`,url,tag:`finance-brief-${date}`,remaining:240})
 }
 if(clock.minute>=270&&prefs.changes&&previous&&Object.values(brief.sources).every(value=>value!=='unavailable')){
  const changed=[...new Set([...Object.keys(previous),...Object.keys(snapshot)])].filter(id=>previous[id]!==snapshot[id])
  if(changed.length)messages.push({key:`changes:${date}:${hash([previous,snapshot])}`,title:'Brevity · Your day changed',body:`${changed.length} assigned item${changed.length===1?' has':'s have'} been added, changed or removed. Open your checklist for the current plan.`,url,tag:`day-changes-${date}`,remaining:120})
 }
 for(const item of items){
  if(item.kind==='calendar'&&brief.sources.calendar!=='available')continue
  if(['Completed','Awaiting verification'].includes(item.progress))continue
  const start=minuteOfDay(item.time),end=minuteOfDay(item.endTime)
  if(start!==null&&clock.minute>=start-prefs.leadMinutes&&clock.minute<=start&&clock.minute<start-prefs.leadMinutes+3)messages.push({key:`before:${date}:${item.id}:${hash([item.time,item.title])}`,title:`Brevity · ${item.title}`,body:`${item.time} · ${start-clock.minute?`Starts in ${start-clock.minute} minutes.`:'Starts now.'} Open your day for details.`,url,tag:`task-${hash(item.id).slice(0,20)}`,remaining:Math.max(1,start-clock.minute)})
  if(prefs.followUps&&item.kind!=='calendar'&&end!==null&&clock.minute>=end+30&&clock.minute<1200)messages.push({key:`overdue:${date}:${item.id}:${item.endTime}`,title:'Brevity · Quick check-in',body:`${item.title}: completed, need help, or need to reschedule? Tell Brevity so the household knows.`,url,tag:`follow-up-${hash(item.id).slice(0,20)}`,remaining:120})
 }
 return {messages,snapshot}
}
export async function sendBriefingOnce({store,key,device,message,keys,deliver,now=new Date()}){
 const entry=await store.getWithMetadata(key,{type:'json'})
 if(entry?.data?.sentAt)return true
 if(entry?.data?.attemptedAt&&now-Date.parse(entry.data.attemptedAt)<120000)return false
 const claimed=await store.setJSON(key,{attemptedAt:now.toISOString()},entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
 if(claimed?.modified!==true)return false
 try{await deliver(device.subscription,message,keys);await store.setJSON(key,{sentAt:new Date().toISOString()});return true}
 catch(error){if([404,410].includes(error.statusCode))await store.delete(`${device.root}devices/${device.id}`);return false}
}
export const reminderMessageId=hash

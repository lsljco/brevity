import webpush from 'web-push'
import {createHash} from 'node:crypto'
import {getStore} from './scoped-store.mjs'
import {householdClock,minuteOfDay,namedFor,isFinished} from '../../src/household/dailyRhythm.js'
export const reminderStore=()=>getStore({name:'brevity-personal-reminders',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export const reminderRoot=()=>`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/`
export const deviceId=endpoint=>createHash('sha256').update(endpoint).digest('hex')
export async function vapidKeys(store){
 const key=`${reminderRoot()}private/vapid`
 let value=await store.get(key,{type:'json'})
 if(!value){await store.setJSON(key,webpush.generateVAPIDKeys(),{onlyIfNew:true});value=await store.get(key,{type:'json'})}
 if(!value?.privateKey||!value?.publicKey)throw Error('Notification setup is unavailable. Try again.')
 return value
}
export function validSubscription(value){
 try{const url=new URL(value.endpoint);if(url.protocol!=='https:'||url.port||url.username||url.password)return false
 const allowed=url.hostname==='web.push.apple.com'||url.hostname.endsWith('.push.apple.com')||url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'
 return allowed&&typeof value.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87,88}$/.test(value.keys.p256dh)&&/^[A-Za-z0-9_-]{22,24}$/.test(value.keys.auth)
 }catch{return false}
}
export function reminderPreferences(input={}){
 return {leadMinutes:[0,5,10,15,30].includes(Number(input.leadMinutes))?Number(input.leadMinutes):15,quietEnabled:input.quietEnabled!==false,quietStart:minuteOfDay(input.quietStart)!==null?input.quietStart:'20:00',quietEnd:minuteOfDay(input.quietEnd)!==null?input.quietEnd:'04:00'}
}
export function inQuietHours(prefs,minute){
 if(!prefs.quietEnabled)return false
 const start=minuteOfDay(prefs.quietStart),end=minuteOfDay(prefs.quietEnd)
 return start===end?false:start<end?minute>=start&&minute<end:minute>=start||minute<end
}
export function dueReminders(plan,member,prefs,now=new Date()){
 const clock=householdClock(now)
 if(!plan||plan.date!==clock.date||inQuietHours(prefs,clock.minute))return []
 const items=(plan.assignments||[]).filter(x=>namedFor(x,member)&&!isFinished(x)).map(x=>({...x,time:x.startTime}))
 // Explicit participants only: a default gym field must never alert the whole household.
 if(plan.fitness?.participants?.includes(member)&&plan.fitness.departureTime)items.push({id:'fitness-departure',time:plan.fitness.departureTime,title:`Depart for ${plan.fitness.location||'the gym'}`})
 for(const block of plan.dayparts||[])for(const [i,item] of (block.items||[]).entries())if(item.owner===member)items.push({...item,id:`daypart-${block.id}-${i}`})
 return items.flatMap(item=>{const start=minuteOfDay(item.time);if(start===null)return []
 const delta=start-clock.minute
 if(delta>prefs.leadMinutes||delta<prefs.leadMinutes-2||delta<0)return []
 return [{key:deviceId(`${plan.date}:${item.id}:${item.time}:${item.title}`),title:'Brevity · Your next responsibility',body:`${item.title}${delta?` in ${delta} minutes`:' now'}. Open Today for details.`,url:'/?reminder=1#daily-rhythm',tag:`brevity-${item.id}`,remaining:delta}]
 })
}
export async function deliverReminder(subscription,message,keys){
 return webpush.sendNotification(subscription,JSON.stringify(message),{TTL:Math.min(900,Math.max(60,(message.remaining||1)*60)),timeout:8000,vapidDetails:{subject:'https://brevityoflife.netlify.app',...keys}})
}

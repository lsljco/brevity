import test from 'node:test'
import assert from 'node:assert/strict'
import {householdClock,minuteOfDay,scheduleAFor,rhythmItems} from './dailyRhythm.js'
import {dueReminders,reminderPreferences,validSubscription,inQuietHours} from '../../netlify/lib/personal-reminders.mjs'
test('daily rhythm preserves household local date and exact named owners',()=>{
 assert.deepEqual(householdClock(new Date('2026-10-07T03:30:00Z')),{date:'2026-10-06',minute:1410})
 assert.equal(minuteOfDay('12:00 AM'),0);assert.equal(minuteOfDay('4:36 AM'),276);assert.equal(minuteOfDay('25:00'),null)
 assert.equal(scheduleAFor('Larry').items[2].startTime,'04:36');assert.equal(scheduleAFor('Terica').items[2].startTime,'04:42')
 assert.equal(rhythmItems({assignments:[{id:'a',startTime:'14:00',owner:'Nyla'}]})[0].block,'flex')
})
test('push reminders target named members, respect completion, quiet hours and changed times',()=>{
 const now=new Date('2026-10-07T08:21:00Z'),prefs=reminderPreferences({leadMinutes:15})
 const plan={date:'2026-10-07',fitness:{departureTime:'04:36',location:'Gym',participants:['Larry','Lorenzo']},assignments:[{id:'a',owner:'Nyla',title:'Kitchen',startTime:'04:36'}]}
 assert.equal(dueReminders(plan,'Larry',prefs,now).length,1)
 assert.equal(dueReminders(plan,'Terica',prefs,now).length,0)
 assert.equal(dueReminders(plan,'Nyla',prefs,now).length,1)
 plan.assignments[0].status='complete';assert.equal(dueReminders(plan,'Nyla',prefs,now).length,0)
 plan.fitness.departureTime='05:00';assert.equal(dueReminders(plan,'Larry',prefs,now).length,0)
 assert.equal(inQuietHours(prefs,60),true);assert.equal(inQuietHours(prefs,300),false)
 assert.equal(dueReminders({...plan,date:'2026-10-08'},'Larry',prefs,now).length,0)
})
test('subscription rejects private destinations and unrelated hosts',()=>{
 const keys={p256dh:'a'.repeat(87),auth:'b'.repeat(22)}
 assert.equal(validSubscription({endpoint:'https://web.push.apple.com/a',keys}),true)
 for(const endpoint of ['https://127.0.0.1/a','https://web.push.apple.com.evil.test/a','http://web.push.apple.com/a','https://user:pass@web.push.apple.com/a'])assert.equal(validSubscription({endpoint,keys}),false)
})

import {normalizeActionOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {createPersonalReminderHandler} from '../../netlify/functions/personal-reminders.mjs'
test('reviewed Schedule A assignments retain times and stable source without calendar writes',()=>{
 const item=scheduleAFor('Larry').items[2]
 const operation=normalizeActionOperation({type:'assignment.create',targetDate:'2026-10-07',payload:{...item,status:'pending'},description:'Departure'})
 const result=applyRecordOperation({assignments:[]},operation,()=> 'assignment-test')
 assert.equal(result.after.assignments[0].startTime,'04:36')
 assert.equal(result.after.assignments[0].source,item.source)
 assert.equal(result.after.assignments[0].calendarSync,false)
})
test('device enrollment requires the current member and only returns the public signing key',async()=>{
 const records=new Map(),store={get:async key=>records.get(key),setJSON:async(key,value)=>records.set(key,value),delete:async key=>records.delete(key)}
 const handler=createPersonalReminderHandler({authenticate:async()=>({member:'Larry'}),storeFactory:()=>store,deliver:async()=>{}})
 const get=await handler(new Request('https://example.test'));const data=await get.json()
 assert.ok(data.publicKey);assert.equal(data.privateKey,undefined)
 const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}
 const post=body=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}))
 assert.equal((await post({member:'Terica',subscription})).status,409)
 assert.equal((await post({member:'Larry',subscription})).status,200)
 assert.equal((await post({member:'Larry',subscription,action:'test'})).status,200)
 assert.equal((await post({member:'Larry',subscription,action:'test'})).status,429)
})

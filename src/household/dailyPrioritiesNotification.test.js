import test from 'node:test'
import assert from 'node:assert/strict'
import {dailyPrioritiesNotification} from '../../netlify/lib/daily-priorities-notification.mjs'
import {dueBriefingMessages} from '../../netlify/lib/daily-briefing-delivery.mjs'
import {reminderPreferences} from '../../netlify/lib/personal-reminders.mjs'
const date='2026-10-15',now=new Date(`${date}T08:30:00Z`)
const input={date,sources:{plan:'available'},plan:{date,household:{keyFocus:'Prepare for interview'},topPriorities:[{id:'other',title:'Other person private work',owner:'Nyla'},{id:'think',title:'Think Tank',owner:'Larry',startTime:'09:00'},{id:'done',title:'Completed work',owner:'Larry',status:'complete'},{id:'next',title:'Tomorrow',owner:'Larry',date:'2026-10-16'},{id:'tax',title:'Pay taxes $5000',owner:'Larry',pillar:'finance'}]}}
test('morning content follows Today focus and personal priorities without private details',()=>{
 const message=dailyPrioritiesNotification(input,'Larry',now)
 assert.match(message.body,/Focus: Prepare for interview/)
 assert.match(message.body,/Think Tank · 09:00 · Larry/)
 assert.match(message.body,/Private priority — details in Brevity/)
 assert.doesNotMatch(message.body,/Other person|Completed work|Tomorrow|5000|taxes/)
 assert.equal(message.url,'/?priorities=1#today-focus')
})
test('missing and stale plans invite priorities instead of replaying yesterday',()=>{
 assert.match(dailyPrioritiesNotification({...input,plan:{...input.plan,date:'2026-10-14'}},'Larry',now).body,/Let’s set today’s priorities/)
 assert.match(dailyPrioritiesNotification({sources:{plan:'unavailable'}},'Larry',now).body,/could not be loaded/)
})
test('one configurable daily message respects quiet hours and replaces duplicate financial alert',()=>{
 const brief={date,member:'Larry',items:[],sources:{}},finance={bills:[],tasks:[]},morning=dailyPrioritiesNotification(input,'Larry',now)
 const args={brief,finance,morning,preferences:{dailyBriefingTime:'06:00'}}
 assert.equal(dueBriefingMessages({...args,now}).messages.length,0)
 const atSix=new Date(`${date}T10:00:00Z`)
 const messages=dueBriefingMessages({...args,now:atSix}).messages
 assert.equal(messages.length,1);assert.equal(messages[0].key,`daily:${date}`);assert.equal(messages[0].body,morning.body)
 assert.equal(dueBriefingMessages({...args,now:atSix,preferences:{dailyBriefingTime:'06:00',quietStart:'00:00',quietEnd:'07:00'}}).messages.length,0)
 assert.equal(reminderPreferences({dailyBriefingTime:'25:00'}).dailyBriefingTime,'04:30')
})
test('calendar preview does not expose a clinical title or another member appointment',()=>{
 const message=dailyPrioritiesNotification({...input,calendar:[{date,owner:'Larry',title:'Kidney specialist follow-up'},{date,owner:'Nyla',title:'Private call'}]},'Larry',now)
 assert.match(message.body,/1 appointment today/);assert.doesNotMatch(message.body,/Kidney|specialist|Private call/)
})

import {readFileSync} from 'node:fs'
import vm from 'node:vm'
test('notification action and body clicks open Today and retain only allowed destinations',async()=>{
 const listeners={},shown=[],opened=[]
 const context={URL,self:{location:{origin:'https://brevity.test'},addEventListener:(name,handler)=>listeners[name]=handler,registration:{showNotification:async(...args)=>shown.push(args)}},clients:{openWindow:async url=>opened.push(url)}}
 vm.runInNewContext(readFileSync(new URL('../../public/brevity-notifications-sw.js',import.meta.url),'utf8'),context)
 let done
 listeners.push({data:{json:()=>dailyPrioritiesNotification(input,'Larry',now)},waitUntil:p=>done=p});await done
 assert.equal(shown[0][1].actions[0].title,'Open Brevity')
 listeners.notificationclick({action:'open-today',notification:{close(){},data:shown[0][1].data},waitUntil:p=>done=p});await done
 assert.equal(opened[0],'https://brevity.test/?priorities=1#today-focus')
 listeners.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>done=p});await done
 assert.equal(new URL(opened[1]).origin,'https://brevity.test')
})

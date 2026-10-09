import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDailyAgenda} from './dailyAgenda.js'
import {meetingVoiceReviewText,assertMeetingVoiceApproval} from '../assistant/meetingVoiceReview.js'
import {dueReminders,reminderPreferences} from '../../netlify/lib/personal-reminders.mjs'
const date='2026-10-09'
test('agenda combines routine overrides and named work without title-based data loss',()=>{
 const agenda=buildDailyAgenda({plan:{date,assignments:[{id:'a',title:'Study',owner:'Larry',startTime:'09:00'}]},schedule:{routines:[{id:'r',title:'Study',owner:'Larry',enabled:true,days:[5],startTime:'10:00'}],routineOverrides:{['r:'+date]:{startTime:'11:00'}}},appointments:[{id:'c',title:'Study',owner:'Larry',time:'12:00'}],member:'Larry'})
 assert.equal(agenda.items.length,3);assert.equal(agenda.items[1].startTime,'11:00');assert.equal(agenda.items[2].sourceKind,'appointment')
})
test('agenda does not assign another member’s private task or count deferred work as an accomplishment',()=>{
 const agenda=buildDailyAgenda({plan:{date,assignments:[{id:'a',owner:'Terica',title:'Work'},{id:'b',owner:'Larry',status:'deferred',title:'Later'},{id:'c',owner:'Larry',title:'Vacuum'}]},member:'Larry'})
 assert.equal(agenda.items.length,2);assert.equal(agenda.completed.length,0);assert.equal(agenda.gaps.length,1)
})
const proposal={id:'p',actor:'Larry',state:'pending',risk:'confirmation',expiresAt:'2030-01-01',operations:[{type:'assignment.create',id:'op',targetDate:date,payload:{title:'Vacuum',owner:'Nyla',startTime:'15:00'},description:'Assign vacuuming',risk:'confirmation',defaultScope:'this-item',allowedScopes:['this-item']}]}
test('meeting voice approval binds exact proposal, phrase, age and scope',()=>{
 const now=Date.parse('2026-10-09T01:00:00Z'),base={proposal,member:'Larry',now,voiceApproval:{proposalId:'p',phrase:'Apply these changes',reviewedAt:now-1000}}
 assert.ok(meetingVoiceReviewText(proposal,'Larry',now).includes('Nyla'));assert.doesNotThrow(()=>assertMeetingVoiceApproval(base))
 for(const patch of [{phrase:'yes'},{proposalId:'other'},{reviewedAt:now-121000}])assert.throws(()=>assertMeetingVoiceApproval({...base,voiceApproval:{...base.voiceApproval,...patch}}))
 assert.equal(meetingVoiceReviewText({...proposal,risk:'strong-confirmation'},'Larry',now),'');assert.equal(meetingVoiceReviewText(proposal,'Terica',now),'')
 assert.equal(meetingVoiceReviewText({...proposal,operations:[{...proposal.operations[0],type:'calendar.delete'}]},'Larry',now),'')
})
test('shared think tank reminder reaches both participants and follows a moved time',()=>{
 const plan={date,assignments:[{id:'think',owner:'Larry',participants:['Lorenzo'],title:'Think Tank',startTime:'09:15'}]},now=new Date('2026-10-09T13:00:00Z'),prefs=reminderPreferences()
 for(const member of ['Larry','Lorenzo'])assert.match(dueReminders(plan,member,prefs,now)[0].body,/15 minutes/)
 assert.equal(dueReminders(plan,'Nyla',prefs,now).length,0)
 plan.assignments[0].startTime='10:00';assert.equal(dueReminders(plan,'Larry',prefs,now).length,0)
 plan.assignments[0].startTime='09:15';plan.assignments[0].cancelled=true;assert.equal(dueReminders(plan,'Larry',prefs,now).length,0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {voiceReviewText,voiceApprovalCommand,assertVoiceApproval,VOICE_REVIEW_MAX_AGE_MS} from './voiceActionReview.js'
const now=Date.parse('2026-09-29T16:00:00Z')
const proposal=()=>normalizeActionProposal({summary:'Ignored model summary',operations:[{type:'household.schedule.block.create',targetDate:'2026-09-29',payload:{title:'Household priorities',date:'2026-09-29',startTime:'18:00',endTime:'18:15',owner:'Larry',participants:[],pillar:'household',notes:'Review tomorrow'}}]},{member:'Larry',role:'admin',now:new Date(now),id:'voice-review'})
const input=()=>({proposal:proposal(),member:'Larry',now,voiceApproval:{proposalId:'voice-review',phrase:'Apply this change.',reviewedAt:now-1000}})
test('spoken review uses actual normalized fields, not a model-authored summary',()=>{
 const text=voiceReviewText(proposal(),'Larry',now)
 for(const value of ['Household priorities','2026-09-29','18:00','18:15','Larry','Review tomorrow'])assert.ok(text.includes(value))
 assert.ok(!text.includes('Ignored model summary'));assert.doesNotThrow(()=>assertVoiceApproval(input()))
})
test('only explicit whole approval or cancellation phrases are recognized',()=>{
 assert.equal(voiceApprovalCommand('Apply this change.'),'approve');assert.equal(voiceApprovalCommand('Cancel this change!'),'cancel')
 for(const phrase of ['yes','okay','apply this change?','do not apply this change','apply this change tomorrow','say apply this change','"apply this change"'])assert.equal(voiceApprovalCommand(phrase),null)
})
test('voice approval rejects a different member, proposal, stale review, future timestamp and expanded scope',()=>{
 const base=input(),op=base.proposal.operations[0]
 for(const changes of [{member:'Terica'},{voiceApproval:{...base.voiceApproval,proposalId:'other'}},{voiceApproval:{...base.voiceApproval,reviewedAt:now-VOICE_REVIEW_MAX_AGE_MS-1}},{voiceApproval:{...base.voiceApproval,reviewedAt:now+1}},{selections:{[op.id]:'this-and-future'}}])assert.throws(()=>assertVoiceApproval({...base,...changes}),/current routine-item review/)
})
test('higher-impact, multiple, expired, already applied, finance and unbound update proposals remain on-screen',()=>{
 const base=proposal()
 for(const value of [{...base,risk:'strong-confirmation'},{...base,operations:[...base.operations,...base.operations]},{...base,expiresAt:new Date(now).toISOString()},{...base,state:'executed'},...['budget.update','household.schedule.block.update','household.schedule.block.delete','calendar.create'].map(type=>({...base,operations:[{...base.operations[0],type}]}))])assert.equal(voiceReviewText(value,'Larry',now),'')
 assert.equal(voiceReviewText({...base,operations:[{...base.operations[0],payload:{...base.operations[0].payload,unknown:'hidden change'}}]},'Larry',now),'')
})

test('updates read the saved identity, changed fields and explicit clearing',()=>{
 const p=proposal(),op=p.operations[0];op.type='assignment.update';op.targetId='saved-task';op.payload={status:'complete',notes:''};op.voiceTarget={id:'saved-task',title:'School follow-up',owner:'Larry',status:'in-progress',resource:'plan:2026-09-29',version:7};p.expectedVersions={'plan:2026-09-29':7}
 const text=voiceReviewText(p,'Larry',now)
 assert.match(text,/Existing item: School follow-up/);assert.match(text,/Status: in-progress/);assert.match(text,/Status: complete/);assert.match(text,/Notes: clear this field/)
 assert.doesNotThrow(()=>assertVoiceApproval({...input(),proposal:p}))
 for(const change of [{id:'wrong'},{title:''},{version:8},{resource:'wrong'}]){const q=structuredClone(p);Object.assign(q.operations[0].voiceTarget,change);assert.equal(voiceReviewText(q,'Larry',now),'')}
})

const activityProposal=(kind='workout')=>normalizeActionProposal({operations:[{type:'activity.record',targetId:'Larry',targetDate:'2026-09-29',payload:{kind,title:'Morning walk',durationMinutes:25,quantity:2,unit:'miles',notes:'Easy pace',status:'complete'}}]},{member:'Larry',role:'admin',now:new Date(now),id:'voice-review'})
test('spoken activity review reads member, date, every reported value and evidence limitation',()=>{
 const p=activityProposal(),text=voiceReviewText(p,'Larry',now)
 for(const value of ['Member: Larry','2026-09-29','workout','Morning walk','25','2','miles','Easy pace','complete','not independently verified'])assert.ok(text.includes(value),value)
 assert.doesNotThrow(()=>assertVoiceApproval({...input(),proposal:p}))
 for(const kind of ['progress','maintenance','study-note','sermon-note','ministry-followup','sleep','hydration'])assert.ok(voiceReviewText(activityProposal(kind),'Larry',now))
})
test('activity voice review excludes other members, financial fields, hidden identity and unsupported kinds',()=>{
 for(const patch of [{targetId:'Terica'},{payload:{...activityProposal().operations[0].payload,amount:10}},{payload:{...activityProposal().operations[0].payload,entryId:'hidden'}},{payload:{kind:'expense',title:'Test',amount:10,currency:'USD'}},{payload:{kind:'module-note',title:'Test',moduleId:'custom-test'}}]){
  const p=activityProposal();Object.assign(p.operations[0],patch);assert.equal(voiceReviewText(p,'Larry',now),'')
 }
})

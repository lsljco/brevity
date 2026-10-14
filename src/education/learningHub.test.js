import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeLearningItem,applyLearningItem,learningAgenda,learningForViewer,LEARNING_HUB_RESOURCE} from './learningHub.js'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {resourceForOperation,applyRecordOperation,recordForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {voiceReviewText,assertVoiceApproval} from '../assistant/voiceActionReview.js'
const fields={title:'AI Curriculum',kind:'program',owner:'Javin'}
test('learning validates URLs, dates, types and unknown/private fields',()=>{
 for(const patch of [{url:'javascript:alert(1)'},{date:'2026-02-30'},{kind:'unknown'},{grades:'private'},{time:'25:00'}])assert.throws(()=>normalizeLearningItem({...fields,...patch}))
 assert.equal(normalizeLearningItem(fields).status,'active')
})
test('learning changes preserve records, bind exact targets and reject cycles',()=>{
 const operation={type:'education.hub.create',targetId:'ai',payload:fields}
 const created=applyRecordOperation({items:[]},operation).after
 assert.equal(resourceForOperation(operation),LEARNING_HUB_RESOURCE)
 assert.equal(recordForOperation(created,operation).id,'ai')
 assert.throws(()=>applyLearningItem(created,operation),/already exists/)
 assert.throws(()=>applyLearningItem(created,{...operation,type:'education.hub.update',targetId:'missing'}),/no longer exists/)
 const child=applyLearningItem(created,{...operation,targetId:'course',payload:{...fields,parentId:'ai'}})
 assert.throws(()=>applyLearningItem(child,{...operation,type:'education.hub.update',payload:{...fields,parentId:'course'}}),/cycle/)
})
test('members can only update their own learning with planning access',()=>{
 const operation={type:'education.hub.update',payload:fields}
 assert.equal(permissionForOperation({operation,member:'Javin',role:'member',permissions:{planning:true},currentRecord:{owner:'Javin'}}).allowed,true)
 for(const changes of [{member:'Nyla'},{permissions:{}},{currentRecord:{owner:'Family'}}])assert.equal(permissionForOperation({operation,member:'Javin',role:'member',permissions:{planning:true},currentRecord:{owner:'Javin'},...changes}).allowed,false)
})
test('daily learning excludes other learners, completed work and undated topics',()=>{
 const items=[{id:'a',owner:'Javin',kind:'assignment',status:'active',date:'2026-10-14'},{id:'b',owner:'Family',kind:'session',status:'active',date:'2026-10-15'},{id:'c',owner:'Larry',kind:'assignment',status:'active',date:'2026-10-14'},{id:'d',owner:'Javin',kind:'assignment',status:'complete',date:'2026-10-14'}]
 const agenda=learningAgenda(learningForViewer(items,'Javin'),'2026-10-14')
 assert.deepEqual(agenda.today.map(x=>x.id),['a']);assert.deepEqual(agenda.upcoming.map(x=>x.id),['b'])
})
test('new learning proposal allows specific, fresh voice approval only',()=>{
 const now=Date.now(),proposal=normalizeActionProposal({summary:'Add learning',operations:[{type:'education.hub.create',targetId:'ai',payload:fields}]},{member:'Larry',role:'admin',now:new Date(now),id:'learn-voice'})
 assert.match(voiceReviewText(proposal,'Larry',now),/AI Curriculum/)
 assert.doesNotThrow(()=>assertVoiceApproval({proposal,member:'Larry',now,voiceApproval:{proposalId:proposal.id,phrase:'Apply this change',reviewedAt:now}}))
 assert.throws(()=>assertVoiceApproval({proposal,member:'Larry',now,voiceApproval:{proposalId:'other',phrase:'yes',reviewedAt:now}}))
})

test('direct learning review checks current version and never writes before approval',async()=>{
 const {prepareDirectProposal}=await import('../../netlify/functions/brevity-assistant-actions.mjs')
 let saved=0,writes=0
 const options={input:{summary:'Add AI curriculum',expectedVersion:2,operation:{type:'education.hub.create',targetId:'new-ai',payload:fields}},session:{member:'Larry',role:'admin'},permissions:{},repository:{saveProposal:async()=>{saved++}},resources:{read:async()=>({value:{items:[]},version:2}),write:async()=>{writes++}}}
 const proposal=await prepareDirectProposal(options)
 assert.equal(proposal.expectedVersions[LEARNING_HUB_RESOURCE],2);assert.equal(saved,1);assert.equal(writes,0)
 await assert.rejects(()=>prepareDirectProposal({...options,input:{...options.input,expectedVersion:1}}),/changed|version|review/i)
 assert.equal(saved,1)
})

test('learning endpoint requires authentication and does not permit direct writes',async()=>{
 const {createHandler}=await import('../../netlify/functions/learning-hub.mjs')
 const handler=createHandler({readSession:async()=>({member:'Javin'}),resources:()=>({read:async()=>({value:{items:[{id:'course'}]},version:4})})})
 assert.equal((await createHandler({readSession:async()=>null})({httpMethod:'GET'})).statusCode,401)
 assert.equal((await handler({httpMethod:'POST'})).statusCode,405)
 assert.equal(JSON.parse((await handler({httpMethod:'GET'})).body).version,4)
 const unavailable=createHandler({readSession:async()=>({member:'Javin'}),resources:()=>({read:async()=>{throw Error('offline')}})})
 assert.equal((await unavailable({httpMethod:'GET'})).statusCode,503)
})

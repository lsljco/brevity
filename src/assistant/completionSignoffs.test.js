import test from 'node:test'
import assert from 'node:assert/strict'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {permissionForOperation,normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyHouseholdRecordOperation,householdPermissionForOperation} from '../household/householdActionModel.js'
import {completionSignoffs,signoffOperation,CHORE_RESOURCE} from '../notifications/completionSignoffs.js'
import {createSignoffHandler} from '../../netlify/functions/completion-signoffs.mjs'
import {dispatchSignoffNotifications} from '../../netlify/lib/completion-signoff-notifications.mjs'
const now=new Date('2026-10-14T16:00:00Z'),context={actor:'Javin',now:()=>now}
const id='2026-10-14:custom-test',choreState={customChores:[{id:'test',title:'Clean kitchen',date:'2026-10-14',owners:['Javin'],details:[],signoffRequired:false}],taskEdits:{[id]:{signoffRequired:false,verifiers:['Javin']}}}
const choreOp=action=>({type:'household.maintenance.completion.update',targetId:id,targetDate:'2026-10-14',payload:{action}})
const submitted=()=>applyHouseholdRecordOperation(choreState,choreOp('submit'),context).after
const project=()=>applyRecordOperation([{id:'p1',title:'Garden',status:'In Progress'}],{type:'project.update',targetId:'p1',payload:{status:'Done'}},undefined,context).after

test('legacy chore opt-outs cannot bypass Larry or Terica sign-off',()=>{
 const state=submitted();assert.equal(state.occurrences[id].complete,false);assert.ok(state.occurrences[id].submittedAt)
 for(const actor of ['Larry','Terica']){assert.equal(householdPermissionForOperation({operation:choreOp('approve'),member:actor,role:'member'}).allowed,true);assert.equal(applyHouseholdRecordOperation(state,choreOp('approve'),{...context,actor}).after.occurrences[id].approvedBy,actor)}
 assert.equal(householdPermissionForOperation({operation:choreOp('approve'),member:'Javin',role:'admin'}).allowed,false)
 assert.throws(()=>applyHouseholdRecordOperation(state,choreOp('approve'),context),/Larry or Terica/)
 assert.throws(()=>normalizeActionProposal({operations:[{type:'household.maintenance.chore.update',targetId:id,targetDate:'2026-10-14',payload:{signoffRequired:false}}]},{member:'Larry'}),/sign.off/i)
})
test('project Done means pending, only Larry may approve and repeat approval fails',()=>{
 const records=project(),op={type:'project.review',targetId:'p1',payload:{action:'approve'}}
 assert.equal(records[0].status,'In Progress');assert.equal(records[0].completionReview.state,'pending')
 assert.equal(permissionForOperation({operation:op,member:'Terica',role:'admin'}).allowed,false)
 assert.throws(()=>applyRecordOperation(records,op,undefined,{...context,actor:'Terica'}),/Larry/)
 const approved=applyRecordOperation(records,op,undefined,{...context,actor:'Larry'}).after
 assert.equal(approved[0].status,'Done');assert.equal(approved[0].completionReview.approvedBy,'Larry')
 assert.throws(()=>applyRecordOperation(approved,op,undefined,{...context,actor:'Larry'}),/awaiting/)
 const returned=applyRecordOperation(records,{...op,payload:{action:'return',reason:'Finish gate'}},undefined,{...context,actor:'Larry'}).after
 assert.equal(returned[0].status,'In Progress');assert.equal(returned[0].completionReview.returnReason,'Finish gate')
 assert.throws(()=>signoffOperation({kind:'project'},'return'),/reason/)
})
test('inbox includes moved chores, limits projects to Larry and removes approved/deleted work',()=>{
 const state=submitted();state.taskEdits[id].date='2026-10-25'
 const args={chores:{value:state,version:7},projects:{value:project(),version:2}}
 assert.equal(completionSignoffs({...args,member:'Larry'}).length,2)
 assert.equal(completionSignoffs({...args,member:'Terica'}).length,1)
 assert.equal(completionSignoffs({...args,member:'Javin'}).length,0)
 assert.equal(completionSignoffs({...args,member:'Larry'})[0].version,7)
 state.occurrences[id].approvedAt=now.toISOString();assert.equal(completionSignoffs({...args,member:'Terica'}).length,0)
 delete state.occurrences[id].approvedAt;state.deletedOccurrences={[id]:true};assert.equal(completionSignoffs({...args,member:'Terica'}).length,0)
})
test('inbox authenticates and Terica never reads project data; failed sources are explicit',async()=>{
 const calls=[],resources=()=>({read:async key=>{calls.push(key);throw Error('offline')}})
 for(const [session,expected] of [[null,401],[{member:'Javin'},403]])assert.equal((await createSignoffHandler({readSession:async()=>session,resources})({httpMethod:'GET'})).statusCode,expected)
 const response=await createSignoffHandler({readSession:async()=>({member:'Terica'}),resources})({httpMethod:'GET'})
 assert.deepEqual(calls,[CHORE_RESOURCE]);assert.deepEqual(JSON.parse(response.body).unavailable,['chores'])
})
test('push routes chores to both reviewers, projects to Larry, deduplicates and respects quiet hours',async()=>{
 const values=new Map(),delivered=[],store={getWithMetadata:async key=>values.has(key)?{data:values.get(key),etag:'1'}:null,setJSON:async(key,value)=>{values.set(key,value);return{modified:true}},delete:async()=>{}}
 const args={chores:{value:submitted(),version:1},projects:{value:project(),version:1},devices:['Larry','Terica','Javin'].map(member=>({member,id:member,subscription:member,preferences:{quietStart:'22:00',quietEnd:'07:00'}})),store,root:'test/',keys:{},deliver:async(member,message)=>delivered.push({member,message}),now}
 await dispatchSignoffNotifications(args);assert.deepEqual(delivered.map(x=>x.member),['Larry','Larry','Terica'])
 await dispatchSignoffNotifications(args);assert.equal(delivered.length,3)
 args.chores.value.occurrences[id].submittedAt='2026-10-14T17:00:00Z'
 await dispatchSignoffNotifications({...args,now:new Date('2026-10-15T03:00:00Z')});assert.equal(delivered.length,3)
 await dispatchSignoffNotifications(args);assert.equal(delivered.length,5)
})

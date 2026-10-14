import test from 'node:test'
import assert from 'node:assert/strict'
import {openWorkForDate,rescheduleOpenWork} from './openWork.js'
import {readOpenWork} from '../../netlify/lib/open-work.mjs'
import {createOpenWorkHandler} from '../../netlify/functions/open-work.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
const date='2026-10-14',sourceDate='2026-10-09'
const task={id:'task-1',title:'Submit application',owner:'Larry',status:'pending'}
const plan={date:sourceDate,version:7,assignments:[task],topPriorities:[{...task,id:'priority-1',title:'Review project'}],household:{keyFocus:'Paint the brick',owner:'Family'}}
test('unfinished work stays on every later day with original source identity and version',()=>{
 for(const date of ['2026-10-10','2026-10-14','2027-03-01']){
 const rows=openWorkForDate({plans:[plan],date});assert.equal(rows.length,3)
 assert.ok(rows.every(x=>x.carriedForward&&x.originalDate===sourceDate&&x.source.date===sourceDate&&x.expectedVersion===7))
 assert.equal(rows.find(x=>x.source.kind==='assignment').operation.targetId,task.id)
 }
 assert.equal(plan.assignments[0].status,'pending')
})
test('completion removes original work from future days; deferred stays open and future dates wait',()=>{
 const p={...plan,assignments:[{...task,status:'deferred'},{...task,id:'future',date:'2026-10-20'},{...task,id:'routine',routineId:'r'}]}
 const rows=openWorkForDate({plans:[p],date});assert.equal(rows.length,3)
 for(const row of rows){const after=applyRecordOperation(p,row.operation).after;assert.equal(openWorkForDate({plans:[after],date}).some(x=>x.id===row.id),false)}
})
test('same-ID updated record is authoritative; independent same-title tasks remain separate',()=>{
 const next={date,version:1,assignments:[{...task,status:'complete'},{...task,id:'task-2'}]}
 const rows=openWorkForDate({plans:[plan,next],date});assert.equal(rows.filter(x=>x.source.kind==='assignment').length,1);assert.equal(rows.find(x=>x.source.kind==='assignment').source.id,'task-2')
})
test('scheduled projects carry forward, completed projects stop, appointments and routines do not move',()=>{
 const rows=openWorkForDate({plans:[{date:sourceDate,household:{appointments:[task]},dayparts:[{items:[task]}]}],projects:[{id:'p',title:'Brick',startDate:sourceDate,raci:{responsible:['Larry','Lorenzo']}},{id:'done',title:'Done',due:sourceDate,status:'Done'},{id:'future',title:'Future',due:'2026-10-20'}],projectVersion:9,date})
 assert.equal(rows.length,1);assert.equal(rows[0].operation.type,'project.update');assert.equal(rows[0].expectedVersion,9);assert.deepEqual(rows[0].participants,['Lorenzo'])
})
test('focus completion is validated and changing the focus reopens it',()=>{
 const operation=openWorkForDate({plans:[plan],date}).find(x=>x.source.kind==='focus').operation
 const proposal=normalizeActionProposal({summary:'Complete focus',operations:[operation]});assert.equal(proposal.operations[0].payload.patch.keyFocusCompleted,true)
 const after=applyRecordOperation(plan,operation).after;assert.equal(after.household.keyFocusCompleted,true)
 const changed=applyRecordOperation(after,{type:'plan.pillar.update',payload:{pillar:'household',patch:{keyFocus:'New focus'}}}).after;assert.equal(changed.household.keyFocusCompleted,false)
})
test('all saved dates are read across pages without writing or silently dropping older work',async()=>{
 const calls=[],plans={async list({cursor}){return cursor?{blobs:[{key:'h/daily-plans/2026-10-09'}]}:{blobs:[{key:'h/daily-plans/2025-01-01'},{key:'h/daily-plans/2026-12-01'}],cursor:'page2'}},async get(key){calls.push(key);return {...plan,date:key.slice(-10),assignments:[{...task,id:key}],topPriorities:[],household:{}}}}
 const rows=await readOpenWork(date,{plans,shared:{get:async()=>null},householdId:'h'});assert.equal(rows.length,2);assert.equal(calls.length,2)
 await assert.rejects(()=>readOpenWork(date,{plans:{...plans,get:async()=>{throw Error('outage')}},shared:{get:async()=>null},householdId:'h'}),/outage/)
})
test('open work endpoint requires sign-in and reports unavailable sources honestly',async()=>{
 const request=new Request('https://brevity.test/.netlify/functions/open-work?date='+date)
 assert.equal((await createOpenWorkHandler({authenticate:async()=>null})(request)).status,401)
 assert.equal((await createOpenWorkHandler({authenticate:async()=>({member:'Larry'}),load:async()=>{throw Error('outage')}})(request)).status,503)
 const response=await createOpenWorkHandler({authenticate:async()=>({member:'Larry'}),load:async()=>openWorkForDate({plans:[plan],date})})(request);assert.equal((await response.json()).items.length,3)
})

test('rescheduling hides work until its chosen date without changing identity or completing it',()=>{
 for(const row of openWorkForDate({plans:[plan],date})){
  const operation=rescheduleOpenWork(row,'2026-10-20'),after=applyRecordOperation(plan,operation).after
  assert.equal(openWorkForDate({plans:[after],date}).some(x=>x.id===row.id),false)
  assert.equal(openWorkForDate({plans:[after],date:'2026-10-20'}).some(x=>x.id===row.id),true)
  assert.equal(operation.targetDate,sourceDate)
 }
 const project=openWorkForDate({plans:[],projects:[{id:'p',title:'Project',startDate:sourceDate,due:'2026-10-11'}],date})[0]
 assert.deepEqual(rescheduleOpenWork(project,'2026-10-20').payload,{date:'2026-10-20',endDate:'2026-10-22'})
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {buildOrchestration,consequenceAssessment,phaseOneAuthority,GOVERNANCE_RESOURCE} from '../governance/orchestration.js'
import {loadOrchestration} from '../../netlify/lib/household-orchestration.mjs'
import {createOrchestrationHandler} from '../../netlify/functions/household-orchestration.mjs'
import {normalizeActionProposal,defaultActionPermissions} from '../../netlify/lib/assistant-action-contract.mjs'
import {prepareRecordOperations,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {executeActionWithJournal,undoActionWithJournal,prepareDirectProposal} from '../../netlify/functions/brevity-assistant-actions.mjs'
const date='2026-10-05',session={member:'Larry',role:'admin'},clone=value=>structuredClone(value)
const planKey=`plan:${date}`,scheduleKey='shared:brevity_household_schedule_v1',choreKey='shared:brevity_household_maintenance_v1'
const plan={date,assignments:[{id:'a1',title:'Prepare dinner checklist',owner:'Terica',status:'pending'}]}
function fixture(){
  const data=new Map([[planKey,{value:clone(plan),version:1}],[scheduleKey,{value:{routines:[],routineOverrides:{}},version:2}],[choreKey,{value:{trackingStartedOn:date},version:3}],[GOVERNANCE_RESOURCE,{value:null,version:0}]])
  return {data,async read(key){if(!data.has(key))throw Error('unavailable');return clone(data.get(key))},async write(key,value,version,actor,mutationId){const current=data.get(key);assert.equal(current.version,version);const next={value:clone(value),version:version+1,record:{version:version+1,updatedBy:actor,lastActionId:mutationId}};data.set(key,next);return clone(next)}}
}
const versions={[planKey]:1,[scheduleKey]:2,[choreKey]:3}
const operation=(event='prepare')=>({type:'orchestration.case.update',targetId:`assignment:${date}:a1`,targetDate:date,payload:{event,note:'Prepared next steps for review.',sourceVersions:versions}})
function proposal(op=operation()){return {...normalizeActionProposal({summary:'Retain assistance',operations:[op]},session),expectedVersions:{[GOVERNANCE_RESOURCE]:0}}}
process.env.BREVITY_GOV001_PHASE1_ENABLED='true'
test('no feature activation means no source reads or background initialization',async()=>{
  const model=await loadOrchestration({enabled:false,date,session,resources:{read(){throw Error('must not read')}}})
  assert.equal(model.enabled,false)
})
test('pending past work stays unknown; no default leadership recipient and evidence is explicit',async()=>{
  const model=await loadOrchestration({date,session,resources:fixture()})
  const item=model.cases.find(x=>x.sourceId==='a1')
  assert.equal(item.state,'unknown');assert.deepEqual(item.owners,['Terica']);assert.equal(item.exception.recipient,null);assert.equal(item.risk.score,null)
  assert.equal(item.stage,'DETECT');assert.ok(item.assistance.checklist.length)
  assert.equal(model.cases.filter(x=>x.kind==='meal').length,3)
})
test('owner and coverage filtering denies unrelated member cases',async()=>{
  const resources=fixture()
  const lorenzo=await loadOrchestration({date,session:{member:'Lorenzo',role:'member'},resources})
  assert.equal(lorenzo.cases.some(x=>x.sourceId==='a1'),false)
  const terica=await loadOrchestration({date,session:{member:'Terica',role:'member'},resources})
  assert.equal(terica.cases.find(x=>x.sourceId==='a1').owners[0],'Terica')
})
test('unavailable source is not an empty successful household',async()=>{
  const resources=fixture();resources.data.delete(planKey)
  const model=await loadOrchestration({date,session,resources})
  assert.equal(model.sourceStates[planKey],'unavailable');assert.ok(model.systemHealth.unavailableSources>0)
  assert.equal(model.cases.some(x=>x.kind==='assignment'),false)
})
test('risk requires all four evidenced factors and never enables escalation',()=>{
  assert.equal(consequenceAssessment({urgency:{value:4,evidence:'Due'}}).score,null)
  const factors=Object.fromEntries(['urgency','impact','recurrence','crossPillarEffect'].map(k=>[k,{value:2,evidence:'Explicit source'}]))
  assert.equal(consequenceAssessment(factors).score,16);assert.equal(consequenceAssessment(factors).automaticEscalation,false)
  assert.equal(phaseOneAuthority({level:'L6',permitted:true,reviewed:true}).allowed,false)
  assert.equal(phaseOneAuthority({level:'L4',permitted:true}).allowed,false)
})
test('case updates require exact source versions, owned source and current planning permission',async()=>{
  const resources=fixture(),p=proposal(),permissions=defaultActionPermissions('member')
  await assert.rejects(prepareRecordOperations({proposal:p,session:{member:'Lorenzo',role:'member'},permissions,resources}),/outside your ownership/)
  await assert.rejects(prepareRecordOperations({proposal:p,session:{member:'Terica',role:'member'},permissions:{planning:false},resources}),/Planning permission/)
  resources.data.get(planKey).version++
  await assert.rejects(prepareRecordOperations({proposal:p,session,permissions,resources}),/sources changed/)
})
test('review cannot forge ownership, completion, routing, source identity or authority',()=>{
  assert.throws(()=>proposal({...operation(),payload:{...operation().payload,owner:'Lorenzo'}}),/supported reviewed/)
  assert.throws(()=>proposal({...operation(),payload:{...operation().payload,event:'verified'}}),/supported reviewed/)
  assert.throws(()=>proposal({...operation(),payload:{...operation().payload,sourceVersions:{}}}),/exact source versions/)
  assert.equal(resourceForOperation(operation()),GOVERNANCE_RESOURCE)
})
test('source completed after review cannot receive a new assistance event',async()=>{
  const resources=fixture();resources.data.get(planKey).value.assignments[0].status='complete'
  await assert.rejects(prepareRecordOperations({proposal:proposal(),session,permissions:defaultActionPermissions('admin'),resources}),/completed/)
})
test('household pause blocks case events; member cannot change household control',async()=>{
  const resources=fixture();resources.data.get(GOVERNANCE_RESOURCE).value={paused:true,cases:{}}
  await assert.rejects(prepareRecordOperations({proposal:proposal(),session,permissions:defaultActionPermissions('admin'),resources}),/paused/)
  const p=proposal({type:'orchestration.pause.update',targetId:'household',targetDate:date,payload:{paused:false}})
  await assert.rejects(prepareRecordOperations({proposal:p,session:{member:'Terica',role:'member'},permissions:defaultActionPermissions('member'),resources}),/administrator/)
})
test('API authenticates and is read-only',async()=>{
  const resources=fixture(),repository={getPermissions:async()=>({Larry:defaultActionPermissions('admin')})}
  const anonymous=createOrchestrationHandler({readSession:async()=>null,resources,repository})
  assert.equal((await anonymous({httpMethod:'GET'})).statusCode,401)
  const handler=createOrchestrationHandler({readSession:async()=>session,resources,repository})
  assert.equal((await handler({httpMethod:'POST'})).statusCode,405)
  const result=await handler({httpMethod:'GET',queryStringParameters:{date}})
  assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).isAdmin,true)
})

function memoryRepository(){
  const journals=new Map(),audits=new Map(),proposals=new Map()
  return{
    proposals,journals,audits,
    async getPermissions(){return{Larry:defaultActionPermissions('admin'),Lorenzo:defaultActionPermissions('member'),Nyla:defaultActionPermissions('member')}},
    async saveProposal(proposal){proposals.set(proposal.id,clone(proposal));return clone(proposal)},
    async getJournalEntry(id){return{journal:clone(journals.get(id)||null)}},
    async ensureJournal(journal){if(!journals.has(journal.id))journals.set(journal.id,clone(journal));return clone(journals.get(journal.id))},
    async updateJournal(id,updater){const current=clone(journals.get(id));if(!current)throw new Error('missing journal');const next=updater(current);journals.set(id,clone(next));return clone(next)},
    async getAudit(id){return clone(audits.get(id)||null)},
    async addAudit(audit){if(!audits.has(audit.id))audits.set(audit.id,clone(audit));return clone(audits.get(audit.id))},
    async markAuditUndone(id,patch){const current=audits.get(id);if(!current)throw new Error('missing audit');const next={...current,...clone(patch),undoAvailable:false};audits.set(id,next);return clone(next)},
  }
}

test('reviewed preparation is retained once with immutable audit and safe Undo',async()=>{
  const resources=fixture(),repository=memoryRepository(),permissions=defaultActionPermissions('admin')
  const prepared=await prepareDirectProposal({input:{summary:'Retain checklist',operation:operation(),expectedVersion:0},session,permissions,repository,resources})
  assert.equal(resources.data.get(GOVERNANCE_RESOURCE).value,null)
  const result=await executeActionWithJournal({proposal:prepared,operations:prepared.operations,session,permissions,repository,resources})
  const events=resources.data.get(GOVERNANCE_RESOURCE).value.cases[operation().targetId].events
  assert.equal(events.length,1);assert.ok(events[0].preparation.checklist.length)
  assert.deepEqual(resources.data.get(planKey).value,plan)
  assert.equal(result.audit.actor,'Larry')
  await executeActionWithJournal({proposal:prepared,operations:prepared.operations,session,permissions,repository,resources})
  assert.equal(resources.data.get(GOVERNANCE_RESOURCE).value.cases[operation().targetId].events.length,1)
  await undoActionWithJournal({auditId:result.audit.id,session,repository,resources})
  assert.equal(resources.data.get(GOVERNANCE_RESOURCE).value,null)
})

import {applyGovernance,normalizeGovernancePayload,policyActive,preferenceResource,defaultPreferences,scheduleConflicts,adaptationSummary} from '../governance/governanceModel.js'
import {createOrchestrationRunner} from '../../netlify/lib/orchestration-runner.mjs'
const approvedPolicy={effectiveDate:'2026-01-01',reviewDate:'2027-01-01',supportMembers:['Nyla'],decisionMaker:'Larry',promptMinutes:240,threshold:16,recurrenceWindow:28,workerEnabled:true,revision:1,approvedBy:'Lorenzo',approvedRevision:1}
const factors=Object.fromEntries(['urgency','impact','recurrence','crossPillarEffect'].map(k=>[k,{value:2,evidence:`Recorded ${k} evidence`}]))
function governed(){const r=fixture();r.data.get(GOVERNANCE_RESOURCE).value={policy:clone(approvedPolicy),cases:{}};const read=r.read.bind(r);r.read=async key=>key.includes('orchestration_preferences_')?clone(r.data.get(key)||{value:null,version:0}):read(key);return r}
function govOperation(event,extra={}){return {type:'orchestration.coordination.update',targetId:operation().targetId,targetDate:date,payload:{event,note:'Observed support need.',sourceVersions:versions,...extra}}}
async function reviewOperation(resources,op,actor=session){return (await prepareRecordOperations({proposal:proposal(op),session:actor,permissions:defaultActionPermissions(actor.role),resources})).prepared}
function retain(resources,events){resources.data.get(GOVERNANCE_RESOURCE).value.cases[operation().targetId]={id:operation().targetId,date,events:events.map((event,i)=>({id:`event-${i}`,actor:'Terica',at:`${date}T12:00:00Z`,policyId:'GOV-001',...event}))}}
test('only Lorenzo can ratify exact policy revision; changing configuration revokes approval',async()=>{
 const resources=governed(),op={type:'orchestration.policy.approve',targetId:'GOV-001',targetDate:date,payload:{revision:1}}
 await assert.rejects(reviewOperation(resources,op),/Lorenzo/)
 assert.equal((await reviewOperation(resources,op,{member:'Lorenzo',role:'member'}))[0].after.policy.approvedBy,'Lorenzo')
 await assert.rejects(reviewOperation(resources,{...op,payload:{revision:2}},{member:'Lorenzo',role:'member'}),/latest policy/)
 const payload=Object.fromEntries(['effectiveDate','reviewDate','supportMembers','decisionMaker','promptMinutes','threshold','recurrenceWindow','workerEnabled'].map(k=>[k,approvedPolicy[k]]))
 const changed=(await reviewOperation(resources,{...op,type:'orchestration.policy.update',payload}))[0].after.policy
 assert.equal(policyActive(changed,date),false);assert.equal(changed.revision,2)
 assert.throws(()=>normalizeGovernancePayload('orchestration.policy.update',{...payload,decisionMaker:''}),/explicit/)
 assert.equal(policyActive({...approvedPolicy,reviewDate:'2026-10-04'},date),false)
})
test('support invitation requires approved candidate, preserves owner and can only be answered by recipient',async()=>{
 const resources=governed()
 await assert.rejects(reviewOperation(resources,govOperation('request-support',{recipient:'Lorenzo'})),/approved support/)
 const prepared=await reviewOperation(resources,govOperation('request-support',{recipient:'Nyla'}),{member:'Terica',role:'member'})
 resources.data.get(GOVERNANCE_RESOURCE).value=prepared[0].after
 const request=prepared[0].after.cases[operation().targetId].events[0]
 await assert.rejects(reviewOperation(resources,govOperation('accept-support',{requestId:request.id})),/Only the invited/)
 const answered=await reviewOperation(resources,govOperation('accept-support',{requestId:request.id}),{member:'Nyla',role:'member'})
 assert.equal(answered[0].after.cases[operation().targetId].events.at(-1).event,'accept-support')
 assert.equal(resources.data.get(planKey).value.assignments[0].owner,'Terica')
 await assert.rejects(reviewOperation(resources,operation(),{member:'Nyla',role:'member'}),/responsible member/)
 await assert.rejects(reviewOperation(resources,govOperation('assess',{factors}),{member:'Nyla',role:'member'}),/responsible member/)
})
test('routine escalation requires evidenced consequence and prior assistance, then exposes a decision-ready packet',async()=>{
 const resources=governed()
 await assert.rejects(reviewOperation(resources,govOperation('escalate')),/consequence/)
 retain(resources,[{event:'assess',factors}])
 await assert.rejects(reviewOperation(resources,govOperation('escalate')),/useful assistance/)
 retain(resources,[{event:'assess',factors},{event:'prepare'}])
 const result=await reviewOperation(resources,govOperation('escalate'))
 const event=result[0].after.cases[operation().targetId].events.at(-1)
 assert.equal(event.recipient,'Larry');assert.equal(event.exception.owner,'Terica');assert.ok(event.exception.attempts.length)
 assert.equal((await reviewOperation(resources,govOperation('decision')))[0].after.cases[operation().targetId].events.at(-1).event,'decision')
 await assert.rejects(reviewOperation(resources,govOperation('decision'),{member:'Terica',role:'member'}),/designated recipient/)
 resources.data.get(GOVERNANCE_RESOURCE).value.paused=true
 await assert.rejects(reviewOperation(resources,govOperation('assess',{factors})),/paused/)
})
test('automatic exception visibility belongs only to ratified explicit recipient; no fallback leader',async()=>{
 const resources=governed();resources.data.get(GOVERNANCE_RESOURCE).value.policy.decisionMaker='Nyla'
 retain(resources,[{event:'assess',factors},{event:'prepare'}])
 const nyla=await loadOrchestration({resources,date,session:{member:'Nyla',role:'member'}})
 assert.equal(nyla.cases.find(c=>c.sourceId==='a1').automaticException,true)
 const lorenzo=await loadOrchestration({resources,date,session:{member:'Lorenzo',role:'member'}})
 assert.equal(lorenzo.cases.some(c=>c.sourceId==='a1'),false)
 resources.data.get(GOVERNANCE_RESOURCE).value.policy.approvedRevision=null
 assert.equal((await loadOrchestration({resources,date,session:{member:'Nyla',role:'member'}})).cases.some(c=>c.sourceId==='a1'),false)
})
test('dependencies reject cycles and inaccessible targets',async()=>{
 const resources=governed();resources.data.get(planKey).value.assignments.push({id:'a2',title:'Second responsibility',owner:'Terica'})
 const target=`assignment:${date}:a2`
 resources.data.get(GOVERNANCE_RESOURCE).value.cases[target]={events:[{event:'dependency',dependencyId:operation().targetId}]}
 await assert.rejects(reviewOperation(resources,govOperation('dependency',{dependencyId:target})),/cycle/)
 await assert.rejects(reviewOperation(resources,govOperation('dependency',{dependencyId:'missing'})),/different responsibility/)
})
test('preferences are own-member only; learning is opt-in and unknowns do not count as failures',async()=>{
 const resources=governed(),op={type:'orchestration.preferences.update',targetId:'Terica',targetDate:date,payload:defaultPreferences()}
 const p={...proposal(op),expectedVersions:{[preferenceResource('Terica')]:0}}
 await assert.rejects(prepareRecordOperations({proposal:p,session,permissions:defaultActionPermissions('admin'),resources}),/own assistance/)
 assert.equal((await prepareRecordOperations({proposal:p,session:{member:'Terica',role:'member'},permissions:defaultActionPermissions('member'),resources})).prepared[0].after.learning,false)
 assert.equal(adaptationSummary([], 'Terica',defaultPreferences()).enabled,false)
 const observations=[{member:'Terica',at:`${date}T15:00:00Z`,state:'unknown'},{member:'Terica',at:`${date}T15:00:00Z`,state:'completed',promptedAt:`${date}T14:00:00Z`,acknowledgedAt:`${date}T14:30:00Z`}]
 const result=adaptationSummary([],'Terica',{...defaultPreferences(),learning:true},new Date(`${date}T16:00:00Z`),observations)
 assert.deepEqual(result.completionReliability,{completed:1,observed:1});assert.equal(result.responseTime.medianMinutes,30)
})
test('Recovery Mode activation and early exit use exact dated changes, audit and safe Undo',async()=>{
 const resources=governed(),repository=memoryRepository(),permissions=defaultActionPermissions('admin')
 resources.data.get(scheduleKey).value={routines:[{id:'r1',title:'Optional project time',owner:'Terica',days:[1],enabled:true,startTime:'16:00',endTime:'17:00'}],routineOverrides:{}}
 const recovery={type:'orchestration.recovery.update',targetId:'recovery-test',targetDate:date,payload:{intent:'propose',title:'Travel coverage',reason:'Reduced capacity',essential:'Protect meals and required care',startsOn:date,endsOn:date,routineIds:['r1'],scheduleVersion:2}}
 const prepared=await prepareDirectProposal({input:{operation:recovery,expectedVersion:0},session,permissions,repository,resources})
 await executeActionWithJournal({proposal:prepared,operations:prepared.operations,session,permissions,repository,resources})
 const saved=resources.data.get(GOVERNANCE_RESOURCE).value.recovery['recovery-test']
 assert.equal(saved.operations.length,1)
 const activate={...recovery,payload:{intent:'activate'}}
 await assert.rejects(prepareDirectProposal({input:{operation:activate,expectedVersion:1},session,permissions,repository,resources}),/exact reviewed/)
 const activation=await prepareDirectProposal({input:{operations:[activate,...saved.operations],expectedVersion:1,expectedVersions:{[GOVERNANCE_RESOURCE]:1,[scheduleKey]:2}},session,permissions,repository,resources})
 const activated=await executeActionWithJournal({proposal:activation,operations:activation.operations,session,permissions,repository,resources})
 assert.equal(resources.data.get(scheduleKey).value.routines[0].owner,'Terica')
 assert.equal(resources.data.get(scheduleKey).value.routineOverrides[`r1:${date}`].cancelled,true)
 const restore=saved.operations.map(op=>({...op,payload:{date,cancelled:false}}))
 const exit=await prepareDirectProposal({input:{operations:[{...recovery,payload:{intent:'end'}},...restore],expectedVersion:2,expectedVersions:{[GOVERNANCE_RESOURCE]:2,[scheduleKey]:3}},session,permissions,repository,resources})
 const ended=await executeActionWithJournal({proposal:exit,operations:exit.operations,session,permissions,repository,resources})
 assert.equal(resources.data.get(scheduleKey).value.routineOverrides[`r1:${date}`].cancelled,false)
 await undoActionWithJournal({auditId:ended.audit.id,session,repository,resources})
 assert.equal(resources.data.get(scheduleKey).value.routineOverrides[`r1:${date}`].cancelled,true)
 assert.equal(resources.data.get(GOVERNANCE_RESOURCE).value.recovery['recovery-test'].status,'active')
 await assert.rejects(undoActionWithJournal({auditId:activated.audit.id,session,repository,resources}),/changed|newer|version/i)
})
function jobStore(initial=null){let value=initial,version=0;return {get value(){return value},async getWithMetadata(){return value?{data:clone(value),etag:String(version)}:null},async setJSON(key,next,options){if(options?.onlyIfNew&&value||options?.onlyIfMatch&&options.onlyIfMatch!==String(version))return {modified:false};value=clone(next);version++;return {modified:true}}}}
test('durable follow-up is scoped, opt-in, idempotent, quiet-window aware, and removes resolved messages',async()=>{
 const resources=governed(),store=jobStore();let clock=new Date(`${date}T16:00:00Z`)
 resources.data.set(preferenceResource('Terica'),{value:{...defaultPreferences(),learning:true},version:1})
 const run=createOrchestrationRunner({store,key:'test',resources,now:()=>clock,createId:()=>`lease-${clock.toISOString()}`})
 assert.equal((await run()).state,'completed')
 assert.equal(store.value.messages.some(m=>m.recipient==='Lorenzo'),false)
 assert.equal(store.value.observations.every(o=>o.member==='Terica'),true)
 assert.equal((await run()).state,'waiting')
 const first=store.value.messages.find(m=>m.caseId===operation().targetId).updatedAt
 clock=new Date(clock.getTime()+16*60000);await run()
 assert.equal(store.value.messages.find(m=>m.caseId===operation().targetId).updatedAt,first)
 resources.data.get(planKey).value.assignments[0].status='completed'
 clock=new Date(clock.getTime()+16*60000);await run()
 assert.equal(store.value.messages.some(m=>m.caseId===operation().targetId),false)
 assert.equal(store.value.observations.find(o=>o.sourceId==='a1').state,'completed')
 resources.data.get(preferenceResource('Terica')).value.learning=false
 clock=new Date(clock.getTime()+16*60000);await run();assert.equal(store.value.observations.length,0)
 clock=new Date(`${date}T04:30:00Z`);store.value.nextRunAt=null;await run();assert.equal(store.value.messages.length,0)
})
test('worker refuses concurrent leases, inactive policy, source failures and stale policy snapshots',async()=>{
 const resources=governed(),clock=new Date(`${date}T16:00:00Z`),store=jobStore({leaseUntil:`${date}T16:01:00Z`})
 const runner=createOrchestrationRunner({store,key:'test',resources,now:()=>clock,createId:()=> 'lease'})
 assert.equal((await runner()).state,'waiting')
 store.value.leaseUntil=null;resources.data.delete(planKey)
 assert.equal((await runner()).state,'retry-pending');assert.equal(store.value.messages.length,0)
 store.value.failures=6;assert.equal((await runner()).state,'attention-required')
 resources.data.get(GOVERNANCE_RESOURCE).value.paused=true;assert.equal((await runner()).state,'inactive')
 const r=governed(),s=jobStore(),read=r.read.bind(r);let count=0;r.read=async key=>{const result=await read(key);if(key===GOVERNANCE_RESOURCE&&++count===3)result.version++;return result}
 assert.equal((await createOrchestrationRunner({store:s,key:'test',resources:r,now:()=>clock,createId:()=> 'lease'})()).state,'retry-pending')
 assert.equal(s.value.messages.length,0)
})
test('cross-pillar overlaps use named attendance and preserve source assignments',()=>{
 const schedule={routines:[{id:'work',title:'Work',owner:'Terica',pillar:'purpose',days:[1],enabled:true,startTime:'09:00',endTime:'10:00'},{id:'care',title:'Care',owner:'Terica',pillar:'health',days:[1],enabled:true,startTime:'09:30',endTime:'10:30'}]}
 const conflicts=scheduleConflicts(schedule,date,'Terica',false)
 assert.equal(conflicts.length,1);assert.equal(conflicts[0].crossPillar,true)
 assert.equal(scheduleConflicts(schedule,date,'Lorenzo',false).length,0)
 assert.equal(schedule.routines[0].owner,'Terica')
})

test('shared Health adapter preserves ownership and supports journaled creation, Undo and stale-write denial',async()=>{
 const resources=governed(),repository=memoryRepository(),permissions=defaultActionPermissions('admin')
 resources.data.set('health:care',{value:{items:[],audit:[]},version:0})
 const op={type:'health.care.create',targetId:'care-1',targetDate:date,payload:{title:'Teeth cleaning',member:'Terica',type:'Dental',status:'Needs scheduling',priority:'Normal',date:'',notes:'Prepare booking options for review.'}}
 assert.equal(resourceForOperation(op),'health:care')
 await assert.rejects(prepareDirectProposal({input:{operation:op,expectedVersion:0},session:{member:'Nyla',role:'member'},permissions:defaultActionPermissions('member'),repository,resources}),/Shared care/)
 const p=await prepareDirectProposal({input:{operation:op,expectedVersion:0},session,permissions,repository,resources})
 const result=await executeActionWithJournal({proposal:p,operations:p.operations,session,permissions,repository,resources})
 assert.equal(resources.data.get('health:care').value.items[0].member,'Terica')
 assert.equal(resources.data.get('health:care').value.items[0].status,'Needs scheduling')
 await assert.rejects(prepareDirectProposal({input:{operation:{...op,type:'health.care.update'},expectedVersion:0},session,permissions,repository,resources}),/changed/)
 await undoActionWithJournal({auditId:result.audit.id,session,repository,resources})
 assert.deepEqual(resources.data.get('health:care').value.items,[])
})
test('snooze is bounded, expires without changing source deadline and blocks follow-up while active',async()=>{
 const resources=governed(),until=new Date(Date.now()+3600000).toISOString()
 const op={...operation('snooze'),payload:{...operation('snooze').payload,snoozeUntil:until}}
 const result=await reviewOperation(resources,op);resources.data.get(GOVERNANCE_RESOURCE).value=result[0].after
 assert.equal((await loadOrchestration({resources,date,session})).cases.find(c=>c.sourceId==='a1').stage,'paused')
 resources.data.get(GOVERNANCE_RESOURCE).value.cases[op.targetId].events[0].snoozeUntil='2020-01-01T00:00:00Z'
 assert.notEqual((await loadOrchestration({resources,date,session})).cases.find(c=>c.sourceId==='a1').stage,'paused')
 assert.throws(()=>proposal({...op,payload:{...op.payload,snoozeUntil:'invalid'}}),/snooze/)
 assert.deepEqual(resources.data.get(planKey).value,plan)
})
test('retained unresolved cases survive the next day without using the wrong source versions',async()=>{
 const resources=governed(),older='2026-10-04',olderKey=`plan:${older}`,id=`assignment:${older}:old-task`
 resources.data.set(olderKey,{value:{date:older,assignments:[{id:'old-task',title:'Pending owner follow-up',owner:'Terica',status:'blocked'}]},version:7})
 resources.data.get(GOVERNANCE_RESOURCE).value.cases[id]={id,date:older,events:[{id:'old-prepare',actor:'Terica',event:'prepare',at:`${older}T12:00:00Z`,policyId:'GOV-001'}]}
 const model=await loadOrchestration({resources,date,session})
 const retained=model.cases.find(c=>c.id===id)
 assert.equal(retained.state,'blocked');assert.equal(retained.sourceVersions[olderKey],7)
 const op={type:'orchestration.case.update',targetId:id,targetDate:older,payload:{event:'acknowledge',note:'Review today',sourceVersions:retained.sourceVersions}}
 assert.equal((await reviewOperation(resources,op))[0].after.cases[id].events.length,2)
 resources.data.get(olderKey).value.assignments[0].status='completed'
 assert.equal((await loadOrchestration({resources,date,session})).cases.some(c=>c.id===id),false)
})

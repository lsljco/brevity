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
 retain(resources,[{event:'assess',factors},{event:'prepare',at:'2026-10-04T08:00:00Z'},{event:'owner-intervention',note:'Confirmed next step with owner',at:'2026-10-04T09:00:00Z'},{event:'support-exhausted',note:'Approved coverage could not resolve the blocker',at:'2026-10-04T14:00:00Z'}])
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
 retain(resources,[{event:'assess',factors},{event:'prepare',at:'2026-10-04T08:00:00Z'},{event:'owner-intervention',note:'Confirmed next step with owner',at:'2026-10-04T09:00:00Z'},{event:'support-exhausted',note:'Approved coverage could not resolve the blocker',at:'2026-10-04T14:00:00Z'}])
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
 assert.deepEqual(result.observedCompletion,{completed:1,observed:1});assert.equal(result.responseTime.medianMinutes,30)
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
 const retainedMessages=clone(store.value.messages);clock=new Date(`${date}T04:30:00Z`);store.value.nextRunAt=null;await run();assert.deepEqual(store.value.messages,retainedMessages)
})
test('worker refuses concurrent leases, inactive policy, source failures and stale policy snapshots',async()=>{
 const resources=governed(),clock=new Date(`${date}T16:00:00Z`),store=jobStore({leaseUntil:`${date}T16:01:00Z`})
 const runner=createOrchestrationRunner({store,key:'test',resources,now:()=>clock,createId:()=> 'lease'})
 assert.equal((await runner()).state,'waiting')
 store.value.leaseUntil=null;resources.data.delete(planKey)
 assert.equal((await runner()).state,'completed');assert.ok(store.value.coverage.unavailableSources>0)
 store.value.failures=6;store.value.nextRunAt=null;assert.equal((await runner()).state,'completed')
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
 await assert.rejects(reviewOperation(resources,{...op,targetDate:date,payload:{...op.payload,sourceVersions:versions}}),/unavailable/)
 await assert.rejects(reviewOperation(resources,{type:'orchestration.coordination.update',targetId:id,targetDate:date,payload:{event:'assess',note:'Review',factors,sourceVersions:versions}}),/different source date/)
 resources.data.get(olderKey).value.assignments[0].status='completed'
 assert.equal((await loadOrchestration({resources,date,session})).cases.some(c=>c.id===id),false)
})

test('existing version-zero sources remain available; explicitly missing sources stay unknown',async()=>{
 const resources=fixture();resources.data.get(planKey).version=0;resources.data.get(scheduleKey).version=0
 const model=await loadOrchestration({resources,date,session})
 assert.equal(model.sourceStates[planKey],'available');assert.equal(model.sourceStates[scheduleKey],'available');assert.ok(model.cases.some(c=>c.sourceId==='a1'))
 resources.data.get(scheduleKey).missing=true
 assert.equal((await loadOrchestration({resources,date,session})).sourceStates[scheduleKey],'unavailable')
})

import {escalationReadiness,eligibleException,caseResolved,activeDependencies,recoveryExitOperations} from '../governance/governanceModel.js'
import {validateGovernance} from '../../netlify/lib/governance-service.mjs'
import {retainObservation} from '../../netlify/lib/orchestration-runner.mjs'
test('routine escalation waits for owner opportunity and support outcome; immediate evidence bypasses delay',()=>{
 const now=new Date('2026-10-05T16:00:00Z'),item={risk:consequenceAssessment(factors),events:[{event:'prepare',at:'2026-10-05T08:00:00Z'}]}
 assert.equal(eligibleException(item,approvedPolicy,now),false)
 item.events.push({event:'owner-intervention',at:'2026-10-05T13:00:00Z'})
 assert.match(escalationReadiness(item,approvedPolicy,now).reason,/window/)
 item.events[1].at='2026-10-05T09:00:00Z'
 assert.equal(eligibleException(item,approvedPolicy,now),false)
 item.events.push({event:'support-exhausted',at:'2026-10-05T14:00:00Z',note:'Coverage unavailable after review'})
 assert.equal(eligibleException(item,approvedPolicy,now),true)
 item.events.push({id:'request',event:'request-support',recipient:'Nyla'})
 assert.equal(eligibleException(item,approvedPolicy,now),false)
 item.events.push({event:'withdraw-support',requestId:'request',note:'No longer needed; other coverage reviewed'})
 assert.equal(eligibleException(item,approvedPolicy,now),true)
 assert.equal(eligibleException({...item,events:[],risk:consequenceAssessment({...factors,urgency:{value:4,evidence:'Immediate consequential deadline'}})},approvedPolicy,now),true)
 item.events.push({event:'decision'})
 assert.equal(eligibleException(item,approvedPolicy,now),false)
})
test('Recovery exit remains reviewable while paused or expired and preserves newer occurrence edits',async()=>{
 const op={type:'household.schedule.occurrence.update',targetId:'r1',targetDate:date,payload:{date,cancelled:true}},snapshot={date,cancelled:true,updatedAt:'original'}
 const saved={status:'active',activatedScheduleVersion:2,operations:[op],activatedOverrides:{[`r1:${date}`]:snapshot}}
 const value={paused:true,policy:{...approvedPolicy,reviewDate:'2026-10-04'},recovery:{r:saved}},source={version:9,value:{routines:[{id:'r1'}],routineOverrides:{[`r1:${date}`]:clone(snapshot)}}}
 const operation={type:'orchestration.recovery.update',targetId:'r',payload:{intent:'end'}},now=new Date('2026-10-05T16:00:00Z')
 const restore=recoveryExitOperations(saved,date,source.value)
 assert.equal(restore.length,1)
 await validateGovernance({operation,value,resources:{read:async()=>source},proposal:{operations:restore},now})
 source.value.routineOverrides[`r1:${date}`].updatedAt='newer'
 assert.equal(recoveryExitOperations(saved,date,source.value).length,0)
 await assert.rejects(validateGovernance({operation,value,resources:{read:async()=>source},proposal:{operations:restore},now}),/exact reviewed/)
 await validateGovernance({operation,value,resources:{read:async()=>source},proposal:{operations:[]},now})
})
test('closed source cases allow learning and resolved assistance can reopen without completing source',async()=>{
 const resources=governed()
 resources.data.get(planKey).value.assignments[0].status='completed'
 assert.equal((await reviewOperation(resources,govOperation('learn')))[0].after.cases[operation().targetId].events.at(-1).event,'learn')
 await assert.rejects(reviewOperation(resources,govOperation('reopen')),/source workflow/)
 resources.data.get(planKey).value.assignments[0].status='pending'
 const resolved=await reviewOperation(resources,govOperation('resolve'));resources.data.get(GOVERNANCE_RESOURCE).value=resolved[0].after
 const model=await loadOrchestration({resources,date,session})
 assert.equal(model.cases.some(c=>c.sourceId==='a1'),false);assert.equal(model.closedCases.some(c=>c.sourceId==='a1'),true)
 const reopened=await reviewOperation(resources,govOperation('reopen'))
 assert.equal(caseResolved(reopened[0].after.cases[operation().targetId].events),false)
 assert.equal(resources.data.get(planKey).value.assignments[0].status,'pending')
 assert.deepEqual(activeDependencies([{event:'dependency',dependencyId:'x'},{event:'remove-dependency',dependencyId:'x'}]),[])
})
test('retention cleanup runs with worker disabled and expired observations cannot be refreshed into eligibility',async()=>{
 const resources=governed(),now=new Date('2026-10-05T16:00:00Z')
 resources.data.set(preferenceResource('Terica'),{version:1,value:{...defaultPreferences(),learning:true,retentionDays:7}})
 resources.data.get(GOVERNANCE_RESOURCE).value.policy.workerEnabled=false
 const store=jobStore({observations:[{id:'assignment:2026-09-01:old:Terica',member:'Terica',at:now.toISOString()}]})
 const run=createOrchestrationRunner({resources,store,key:'test',now:()=>now})
 assert.equal((await run()).state,'inactive');assert.deepEqual(store.value.observations,[])
 assert.equal(retainObservation({date:'2026-09-01',at:now.toISOString()},{...defaultPreferences(),learning:true},now),false)
})
test('worker rotates more than fifty cases and retains inbox items outside prompting windows',async()=>{
 const resources=governed(),store=jobStore();let now=new Date('2026-10-05T16:00:00Z')
 resources.data.get(planKey).value.assignments=Array.from({length:60},(_,i)=>({id:`audit-${i}`,title:`Task ${i}`,owner:'Terica',status:'pending'}))
 const run=createOrchestrationRunner({resources,store,key:'test',now:()=>now})
 await run();assert.equal(store.value.messages.filter(m=>m.recipient==='Terica').length,50)
 now=new Date(now.getTime()+16*60000);await run();assert.equal(store.value.messages.filter(m=>m.recipient==='Terica').length,60)
 const before=clone(store.value.messages)
 now=new Date('2026-10-06T01:00:00Z');await run()
 assert.deepEqual(store.value.messages,before)
})
test('prompt method remains the original method after preferences change',async()=>{
 const resources=governed(),store=jobStore();let now=new Date('2026-10-05T16:00:00Z')
 const pref={version:1,value:{...defaultPreferences(),learning:true,style:'checklist'}};resources.data.set(preferenceResource('Terica'),pref)
 const run=createOrchestrationRunner({resources,store,key:'test',now:()=>now});await run()
 pref.value.style='options';pref.version++
 now=new Date(now.getTime()+16*60000);await run()
 assert.equal(store.value.observations.find(o=>o.sourceId==='a1').style,'checklist')
})
test('review reminder does not extend legacy authorization or expire an explicitly longer authorization',()=>{
 assert.equal(policyActive({...approvedPolicy,reviewDate:'2026-10-04'},date),false)
 assert.equal(policyActive({...approvedPolicy,reviewDate:'2026-10-04',expiresOn:'2026-10-10'},date),true)
 const payload=Object.fromEntries(['effectiveDate','reviewDate','supportMembers','decisionMaker','promptMinutes','threshold','recurrenceWindow','workerEnabled'].map(k=>[k,approvedPolicy[k]]))
 assert.throws(()=>normalizeGovernancePayload('orchestration.policy.update',{...payload,expiresOn:'2026-09-01'}),/expire before/)
})
test('worker follows previously prompted source to completion across date boundaries without requiring a retained case event',async()=>{
 const resources=governed(),store=jobStore();let now=new Date('2026-10-05T16:00:00Z')
 resources.data.set(preferenceResource('Terica'),{version:1,value:{...defaultPreferences(),learning:true}})
 const run=createOrchestrationRunner({resources,store,key:'test',now:()=>now});await run()
 resources.data.get(planKey).value.assignments[0].status='completed';resources.data.get(planKey).version++
 resources.data.set('plan:2026-10-06',{version:1,value:{date:'2026-10-06',assignments:[]}})
 now=new Date('2026-10-06T16:00:00Z');await run()
 assert.equal(store.value.observations.find(o=>o.sourceId==='a1').state,'completed')
 assert.equal(store.value.messages.some(m=>m.caseId===operation().targetId),false)
})
test('consent revoked during a run prevents that member observations from being committed',async()=>{
 const resources=governed(),store=jobStore(),now=new Date('2026-10-05T16:00:00Z'),prefKey=preferenceResource('Terica')
 resources.data.set(prefKey,{version:1,value:{...defaultPreferences(),learning:true}})
 const read=resources.read.bind(resources);let reads=0
 resources.read=async key=>{if(key===prefKey&&++reads===2)resources.data.set(prefKey,{version:2,value:defaultPreferences()});return read(key)}
 await createOrchestrationRunner({resources,store,key:'test',now:()=>now})()
 assert.deepEqual(store.value.observations,[])
})
test('automatic leader visibility ends for completed and paused cases without an explicit sharing event',async()=>{
 const resources=governed(),session={member:'Nyla',role:'member'}
 resources.data.get(GOVERNANCE_RESOURCE).value.policy.decisionMaker='Nyla'
 retain(resources,[{event:'assess',factors:{...factors,urgency:{value:4,evidence:'Immediate deadline'}}}])
 assert.equal((await loadOrchestration({resources,date,session})).cases.some(c=>c.sourceId==='a1'),true)
 resources.data.get(planKey).value.assignments[0].status='completed'
 assert.equal((await loadOrchestration({resources,date,session})).closedCases.some(c=>c.sourceId==='a1'),false)
 resources.data.get(planKey).value.assignments[0].status='pending'
 resources.data.get(GOVERNANCE_RESOURCE).value.cases[operation().targetId].events.push({event:'pause',policyId:'GOV-001'})
 assert.equal((await loadOrchestration({resources,date,session})).cases.some(c=>c.sourceId==='a1'),false)
})
test('reviewed assistance depends on its actual sources, not an unrelated unavailable source',async()=>{
 const resources=governed();resources.data.delete(scheduleKey)
 const model=await loadOrchestration({resources,date,session})
 const item=model.cases.find(c=>c.sourceId==='a1')
 assert.deepEqual(item.sourceVersions,{[planKey]:1})
 const op={...operation(),payload:{...operation().payload,sourceVersions:item.sourceVersions}}
 assert.equal((await reviewOperation(resources,op))[0].after.cases[item.id].events.at(-1).event,'prepare')
 resources.data.get(planKey).version++
 await assert.rejects(reviewOperation(resources,op),/sources changed/)
})

test('Shared Health cases preserve member privacy, unknown outcomes, stable identity and exact review versions',async()=>{
 const resources=governed()
 resources.data.set('health:care',{version:4,value:{items:[{id:'dental',title:'Teeth cleaning',member:'Terica',type:'Dental',status:'Needs scheduling',date:'',notes:'Private details'},{id:'eye',title:'Eye visit',member:'Nyla',type:'Eye care',status:'Scheduled',date:'2026-10-04'},{id:'later',title:'Later visit',member:'Terica',status:'Scheduled',date:'2026-12-01'}]}})
 const own=await loadOrchestration({resources,date,session:{member:'Terica',role:'member'}})
 const care=own.cases.find(c=>c.kind==='care')
 assert.equal(care.id,'care:dental');assert.equal(care.state,'not started');assert.deepEqual(care.sourceVersions,{'health:care':4})
 assert.equal(own.cases.some(c=>c.sourceId==='eye'||c.sourceId==='later'),false)
 assert.equal(JSON.stringify(care).includes('Private details'),false)
 const admin=await loadOrchestration({resources,date,session})
 assert.equal(admin.cases.find(c=>c.sourceId==='eye').state,'in progress')
 const op={type:'orchestration.case.update',targetId:care.id,targetDate:date,payload:{event:'prepare',note:'Prepare options',sourceVersions:care.sourceVersions}}
 const changes=await reviewOperation(resources,op,{member:'Terica',role:'member'})
 resources.data.get(GOVERNANCE_RESOURCE).value=changes[0].after
 assert.equal((await loadOrchestration({resources,date:'2026-10-06',session})).cases.filter(c=>c.id==='care:dental').length,1)
 const support={...op,type:'orchestration.coordination.update',payload:{event:'request-support',recipient:'Nyla',note:'Help',sourceVersions:care.sourceVersions}}
 await assert.rejects(reviewOperation(resources,support,{member:'Terica',role:'member'}),/Broader sharing/)
 resources.data.get('health:care').version++
 await assert.rejects(reviewOperation(resources,op,{member:'Terica',role:'member'}),/sources changed/)
})

test('assistance closure does not resolve a dependency until source outcome is completed',async()=>{
 const resources=governed(),id=operation().targetId,other=`assignment:${date}:a2`
 resources.data.get(planKey).value.assignments.push({id:'a2',title:'Next step',owner:'Terica',status:'pending',pillar:'education'})
 const governance=resources.data.get(GOVERNANCE_RESOURCE).value
 governance.cases={[id]:{id,date,events:[{event:'resolve',note:'No more assistance',policyId:'GOV-001'}]},[other]:{id:other,date,events:[{event:'dependency',dependencyId:id,dependencyTitle:'Preparation',policyId:'GOV-001'}]}}
 let model=await loadOrchestration({resources,date,session})
 assert.equal(model.systemHealth.closedAssistanceOutstanding,1);assert.equal(model.systemHealth.unresolvedDependencies,1)
 resources.data.get(planKey).value.assignments[0].status='completed'
 model=await loadOrchestration({resources,date,session})
 assert.equal(model.systemHealth.closedAssistanceOutstanding,0);assert.equal(model.systemHealth.unresolvedDependencies,0)
})

test('durable tracking rotates beyond seven dates without learning consent or new prompts',async()=>{
 const resources=governed(),trackedCases=[]
 for(let day=20;day<=29;day++){
  const d=`2026-09-${day}`,id=`assignment:${d}:old-${day}`
  resources.data.set(`plan:${d}`,{version:1,value:{date:d,assignments:[{id:`old-${day}`,title:'Retained obligation',owner:'Terica',status:'pending'}]}})
  trackedCases.push({caseId:id,date:d})
 }
 const store=jobStore({trackedCases}),now=new Date(`${date}T16:00:00Z`)
 const run=createOrchestrationRunner({resources,store,key:'test',now:()=>now})
 assert.equal((await run()).state,'completed')
 assert.equal(store.value.trackedCases.filter(c=>c.caseId.includes('old-')).length,10)
 assert.equal(store.value.observations.length,0)
 now.setMinutes(now.getMinutes()+16);await run()
 assert.ok(store.value.backlogCheckedAt['2026-09-20'])
 assert.equal(store.value.trackedCases.filter(c=>c.caseId.includes('old-')).length,10)
})

test('adaptive measures deduplicate outcomes, exclude invalid or future states, and calculate even medians',()=>{
 const now=new Date(`${date}T16:00:00Z`),prefs={...defaultPreferences(),learning:true}
 const a={caseId:'one',member:'Terica',date,at:`${date}T14:00:00Z`,promptedAt:`${date}T14:00:00Z`,acknowledgedAt:`${date}T14:10:00Z`,state:'in progress',style:'checklist'}
 const b={...a,caseId:'two',state:'completed',acknowledgedAt:`${date}T14:30:00Z`}
 const result=adaptationSummary([],'Terica',prefs,now,[a,{...a,state:'completed',lastObservedAt:`${date}T15:00:00Z`},b,{...a,caseId:'bad',state:'invented'},{...a,caseId:'future',date:'2026-10-06'}])
 assert.deepEqual(result.observedCompletion,{completed:2,observed:2})
 assert.deepEqual(result.responseTime,{medianMinutes:20,samples:2})
 assert.match(result.evidence,/Limited observations/)
 assert.equal(adaptationSummary([],'Terica',{...prefs,learning:false},now,[a]).enabled,false)
})

test('source outages preserve durable case tracking and Health prompts remain owner-only',async()=>{
 const resources=governed(),store=jobStore(),now=new Date(`${date}T16:00:00Z`)
 resources.data.set('health:care',{version:1,value:{items:[{id:'care-one',member:'Terica',title:'Arrange care',status:'Needs review'}]}})
 const run=createOrchestrationRunner({resources,store,key:'test',now:()=>now})
 await run()
 assert.deepEqual(store.value.messages.filter(m=>m.caseId==='care:care-one').map(m=>m.recipient),['Terica'])
 assert.ok(store.value.trackedCases.some(c=>c.caseId===operation().targetId))
 resources.data.delete(planKey);now.setMinutes(now.getMinutes()+16);await run()
 assert.ok(store.value.trackedCases.some(c=>c.caseId===operation().targetId))
 assert.equal(store.value.messages.some(m=>m.caseId===operation().targetId),false)
 resources.data.get('health:care').value.items[0].status='Completed';resources.data.get('health:care').version++
 now.setMinutes(now.getMinutes()+16);await run()
 assert.equal(store.value.messages.some(m=>m.caseId==='care:care-one'),false)
 assert.equal(store.value.trackedCases.some(c=>c.caseId==='care:care-one'),false)
})

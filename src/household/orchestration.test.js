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

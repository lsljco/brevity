import assert from 'node:assert/strict'
import test from 'node:test'
import { actionRisk, defaultActionPermissions, normalizeActionProposal, normalizePermissionMatrix, permissionForOperation, selectedOperation } from '../../netlify/lib/assistant-action-contract.mjs'
import { applyRecordOperation, executeRecordOperations, resourceForOperation } from '../../netlify/lib/assistant-action-executor.mjs'
import { createEmptyDailyPlan } from '../household/dailyPlan.js'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { publicAssistantAudit } from '../../netlify/functions/brevity-assistant-actions.mjs'

test('action proposals accept only the explicit Brevity tool allowlist',()=>{
  const proposal=normalizeActionProposal({summary:'Update the decision',operations:[{type:'decision.update',description:'Assign the open decision to Larry',targetId:'d1',targetDate:'2026-09-05',payloadJson:'{"owner":"Larry","status":"determined"}',allowedScopes:['this-item'],defaultScope:'this-item'}]},{member:'Larry',role:'admin',now:new Date('2026-09-05T10:00:00Z'),id:'proposal-1'})
  assert.equal(proposal.operations[0].payload.owner,'Larry')
  assert.equal(proposal.risk,'confirmation')
  assert.throws(()=>normalizeActionProposal({operations:[{type:'payment.send',payloadJson:'{}'}]},{member:'Larry'}),/Unsupported assistant action/)
})

test('a confirmation cannot mix independently versioned record groups',()=>{
  assert.throws(()=>normalizeActionProposal({operations:[
    {type:'decision.update',description:'Close decision',targetId:'d1',targetDate:'2026-09-05',payloadJson:'{"status":"complete"}'},
    {type:'project.update',description:'Close project',targetId:'p1',payloadJson:'{"status":"complete"}'},
  ]},{member:'Larry',role:'admin'}),/one Brevity record group/)
})

test('mutating proposals require exact ids and occurrence dates',()=>{
  assert.throws(()=>normalizeActionProposal({operations:[{type:'decision.update',description:'Close decision',targetId:'',targetDate:'2026-09-05',payloadJson:'{}'}]},{member:'Larry'}),/exact record id/)
  assert.throws(()=>normalizeActionProposal({operations:[{type:'recurring.update',description:'Change income',targetId:'r1',targetDate:'',payloadJson:'{"amount":100}'}]},{member:'Larry'}),/exact occurrence date/)
})

test('this-and-future recurrence changes require strong confirmation',()=>{
  const operation=normalizeActionProposal({operations:[{type:'recurring.update',description:'Change future amount',targetId:'r1',targetDate:'2026-09-11',payloadJson:'{"amount":200}',allowedScopes:['this-item','this-and-future'],defaultScope:'this-item'}]},{member:'Larry',role:'admin'}).operations[0]
  assert.equal(actionRisk(operation.type,'this-item'),'confirmation')
  assert.equal(selectedOperation(operation,'this-and-future').risk,'strong-confirmation')
})

test('member permissions block finance and records owned solely by someone else',()=>{
  const permissions=defaultActionPermissions('member')
  assert.equal(permissionForOperation({operation:{domain:'finance',type:'budget.update'},member:'Nyla',role:'member',permissions}).allowed,false)
  assert.equal(permissionForOperation({operation:{domain:'planning',type:'decision.update'},member:'Nyla',role:'member',permissions,currentRecord:{owner:'Lorenzo'}}).allowed,false)
  assert.equal(normalizePermissionMatrix({Nyla:{projects:false}}).Nyla.projects,false)
  assert.equal(normalizePermissionMatrix({Larry:{finance:false}}).Larry.finance,true)
})

test('member-facing audit history omits stored before and after snapshots',()=>{
  const visible=publicAssistantAudit({id:'a1',summary:'Updated budget',actor:'Larry',changes:[{before:{salary:1},after:{salary:2}}],operations:[{id:'o1',type:'budget.update',domain:'finance',description:'Update budget',selectedScope:'this-item'}],undoAvailable:true})
  assert.equal('changes' in visible,false)
  assert.deepEqual(visible.operations[0],{id:'o1',type:'budget.update',domain:'finance',description:'Update budget',selectedScope:'this-item'})
})

test('record executor updates decisions and preserves a complete before image',()=>{
  const original={decisions:[{id:'d1',title:'Choose vendor',owner:'Larry',status:'needs-decision'}]}
  const result=applyRecordOperation(original,{type:'decision.update',targetId:'d1',payload:{status:'complete',notes:'Approved'}})
  assert.equal(result.after.decisions[0].status,'complete')
  assert.equal(result.before.decisions[0].status,'needs-decision')
  assert.equal(original.decisions[0].status,'needs-decision')
})

test('a first assignment can initialize an otherwise missing dated daily plan',()=>{
  const date='2026-09-05'
  const result=applyRecordOperation(createEmptyDailyPlan(date),{type:'assignment.create',targetDate:date,description:'Create Action Mode Test',payload:{title:'Action Mode Test',owner:'Larry'}},()=> 'assignment-1')
  assert.equal(result.after.date,date)
  assert.deepEqual(result.after.assignments.map(({id,title,owner,date})=>({id,title,owner,date})),[{id:'assignment-1',title:'Action Mode Test',owner:'Larry',date}])
})

test('recurring executor applies explicit one versus future scope semantics',()=>{
  const finance={transactions:[{id:'r1',name:'Income',amount:100,type:'income',freq:'weekly',start:'2026-09-04',end:'',skips:[]}]}
  const one=applyRecordOperation(finance,{type:'recurring.update',targetId:'r1',targetDate:'2026-09-11',selectedScope:'this-item',payload:{amount:125}},()=> 'one')
  assert.equal(one.after.transactions.find(item=>item.id==='one').amount,125)
  const future=applyRecordOperation(finance,{type:'recurring.delete',targetId:'r1',targetDate:'2026-09-11',selectedScope:'this-and-future',payload:{}})
  assert.equal(future.after.transactions[0].end,'2026-09-10')
})

test('execution groups same-record operations into one versioned write',async()=>{
  let value={decisions:[{id:'d1',title:'One',owner:'Larry',status:'needs-decision'},{id:'d2',title:'Two',owner:'Larry',status:'needs-decision'}]},version=3,writes=0
  const resources={read:async()=>({value,version}),write:async(_resource,next,expected)=>{assert.equal(expected,3);writes+=1;value=next;version=4;return{value,version}}}
  const proposal={operations:[{id:'o1',type:'decision.update',domain:'planning',targetId:'d1',targetDate:'2026-09-05',payload:{status:'complete'},allowedScopes:['this-item'],defaultScope:'this-item'},{id:'o2',type:'decision.update',domain:'planning',targetId:'d2',targetDate:'2026-09-05',payload:{status:'deferred'},allowedScopes:['this-item'],defaultScope:'this-item'}]}
  const result=await executeRecordOperations({proposal,selections:{},session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources})
  assert.equal(writes,1);assert.equal(result.changes[0].afterVersion,4);assert.equal(value.decisions[1].status,'deferred');assert.equal(resourceForOperation(proposal.operations[0]),'plan:2026-09-05')
})

test('proposal repository persists proposals, permissions, and bounded audit history',async()=>{
  const values=new Map(),store={get:async key=>values.get(key)||null,setJSON:async(key,value)=>values.set(key,structuredClone(value))}
  let sequence=0
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-05T12:00:00Z'),createId:()=>`audit-${++sequence}`})
  await repository.saveProposal({id:'p1',state:'pending'});assert.equal((await repository.getProposal('p1')).state,'pending')
  const permissions=await repository.savePermissions({Nyla:{projects:false}},'Larry');assert.equal(permissions.Nyla.projects,false)
  const audit=await repository.addAudit({summary:'Updated',actor:'Larry'});assert.equal(audit.id,'audit-1');assert.equal((await repository.history()).length,1)
})

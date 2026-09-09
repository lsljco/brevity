import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { defaultActionPermissions, normalizeActionProposal } from '../../netlify/lib/assistant-action-contract.mjs'
import { applyRecordOperation } from '../../netlify/lib/assistant-action-executor.mjs'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { executeActionWithJournal, prepareDirectProposal, undoActionWithJournal } from '../../netlify/functions/brevity-assistant-actions.mjs'
import { buildScheduledActionPayload, scheduledActionScope } from './scheduledActionReview.js'

const plannerSource = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')
const executorSource = readFileSync(new URL('../../netlify/lib/assistant-action-executor.mjs', import.meta.url), 'utf8')

function versionedBlobStore() {
  const values = new Map()
  let sequence = 0
  const clone = value => value == null ? value : structuredClone(value)
  return {
    async get(key) { return clone(values.get(key)?.data ?? null) },
    async getWithMetadata(key) { const entry=values.get(key); return entry ? { data:clone(entry.data), etag:entry.etag } : null },
    async setJSON(key, value, options = {}) {
      const current=values.get(key)
      if (options.onlyIfNew && current) return { modified:false, etag:current.etag }
      if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified:false, etag:current?.etag || null }
      const etag=`etag-${++sequence}`
      values.set(key, { data:clone(value), etag })
      return { modified:true, etag }
    },
  }
}

function versionedFinanceResources(initial, initialVersion = 3) {
  let value=structuredClone(initial),version=initialVersion,record={updatedBy:'seed',lastActionId:''}
  return {
    snapshot:()=>({ value:structuredClone(value), version }),
    async read(resource) { assert.equal(resource, 'shared:lslj_finance_v9'); return { value:structuredClone(value), version, record } },
    async write(resource, next, expectedVersion, actor, mutationId) {
      assert.equal(resource, 'shared:lslj_finance_v9')
      if (expectedVersion !== version) throw Object.assign(new Error('version conflict'), { code:'VERSION_CONFLICT' })
      version+=1;value=structuredClone(next);record={updatedBy:actor,lastActionId:mutationId}
      return { value:structuredClone(value), version }
    },
  }
}

const baseFinance = {
  accounts:[{id:'a1',name:'Operating Account'},{id:'a2',name:'Savings'}],
  transactions:[{id:'phone',name:'Cell phones',amount:400,type:'expense',freq:'monthly',start:'2026-09-10',end:'',cat:'Utilities',acct:'a1',skips:[]}],
}

test('scheduled editor prepares only the exact changed fields and preserves explicit scope semantics', () => {
  const current=baseFinance.transactions[0]
  const payload=buildScheduledActionPayload({ ...current, amount:450, start:'2026-10-10' }, { current, occurrenceDate:'2026-09-10' })
  assert.deepEqual(payload, { amount:450, date:'2026-10-10' })
  assert.deepEqual(scheduledActionScope(current, { occurrence:true }), { allowedScopes:['this-item','this-and-future'], defaultScope:'this-item' })
  assert.deepEqual(scheduledActionScope(current, { occurrence:true, requestedScope:'future' }), { allowedScopes:['this-and-future'], defaultScope:'this-and-future' })
  assert.deepEqual(scheduledActionScope({ ...current, freq:'once' }), { allowedScopes:['this-item'], defaultScope:'this-item' })
})

test('recurrence shape changes are always reviewed as this-and-future changes', () => {
  const proposal=normalizeActionProposal({operations:[{
    type:'recurring.update',targetId:'phone',targetDate:'2026-09-10',description:'Change the phone schedule',
    payload:{frequency:'quarterly',endDate:'2027-09-10'},
    allowedScopes:['this-item','this-and-future'],defaultScope:'this-item',
  }]},{member:'Larry',role:'admin',now:new Date('2026-09-07T12:00:00Z'),id:'series-shape'})
  assert.deepEqual(proposal.operations[0].allowedScopes, ['this-and-future'])
  assert.equal(proposal.operations[0].defaultScope, 'this-and-future')
  assert.equal(proposal.operations[0].risk, 'strong-confirmation')
  assert.match(proposal.operations[0].description, /This and future items/)

  assert.throws(() => applyRecordOperation(baseFinance, {
    ...proposal.operations[0],
    allowedScopes:['this-item'],defaultScope:'this-item',selectedScope:'this-item',
  }), /must apply to this and future items/)
  assert.match(plannerSource, /Frequency and end-date changes require “This and future items\.”/)
})

test('scheduled transfer proposals are unmistakably forecast-only and never invoke a bank endpoint', async () => {
  const transfer=normalizeActionProposal({operations:[{
    type:'recurring.create',description:'Create a scheduled cash-plan record',targetDate:'2026-09-12',
    payload:{title:'Move to savings plan',amount:500,transactionType:'transfer',frequency:'once',accountId:'a1',transferAccountId:'a2',category:'Transfer'},
    allowedScopes:['this-item','this-and-future'],defaultScope:'this-and-future',
  }]},{member:'Larry',role:'admin',now:new Date('2026-09-07T12:00:00Z'),id:'planned-transfer'})
  assert.deepEqual(transfer.operations[0].allowedScopes, ['this-item'])
  assert.equal(transfer.operations[0].defaultScope, 'this-item')
  assert.match(transfer.operations[0].description, /Forecast-only planned transfer; no money will move/)
  const planned=applyRecordOperation(baseFinance, transfer.operations[0], ()=>'planned-transfer-record')
  assert.deepEqual(planned.after.transactions.at(-1), {
    id:'planned-transfer-record',name:'Move to savings plan',amount:500,type:'transfer',freq:'once',start:'2026-09-12',end:'',cat:'Transfer',acct:'a1',transferTo:'a2',skips:[],
  })
  assert.match(plannerSource, /Planned transfer \(forecast only\)/)
  assert.match(plannerSource, /cannot move money or change a bank account/)
  assert.doesNotMatch(executorSource, /\bfetch\s*\(|link[_-]?token|payment[_-]?initiate/i)
})

test('reviewed future moves reject an inherited end date before the new effective date', () => {
  const endingFinance={...baseFinance,transactions:[{...baseFinance.transactions[0],end:'2026-10-10'}]}
  assert.throws(() => applyRecordOperation(endingFinance, {
    type:'recurring.update',targetId:'phone',targetDate:'2026-10-10',payload:{date:'2026-11-10'},
    selectedScope:'this-and-future',
  }), /end date cannot be before/)
})

test('scheduled updates reject no-ops and transfer-only fields on ordinary income or expenses', () => {
  assert.throws(() => applyRecordOperation(baseFinance, {
    type:'recurring.update',targetId:'phone',targetDate:'2026-09-10',payload:{amount:400},selectedScope:'this-item',
  }), /already has the reviewed values/)
  assert.throws(() => applyRecordOperation(baseFinance, {
    type:'recurring.update',targetId:'phone',targetDate:'2026-09-10',payload:{transferAccountId:'a2'},selectedScope:'this-item',
  }), /Only a forecast-only planned transfer/)
  assert.throws(() => normalizeActionProposal({operations:[{
    type:'recurring.create',description:'Create expense',targetDate:'2026-09-12',
    payload:{title:'Expense',amount:50,transactionType:'expense',frequency:'once',accountId:'a1',transferAccountId:'a2'},
  }]},{member:'Larry',role:'admin'}), /Only a forecast-only planned transfer/)
})

test('reviewed type changes can clear a planned-transfer destination without retaining transfer semantics', () => {
  const transferFinance={...baseFinance,transactions:[{
    ...baseFinance.transactions[0],type:'transfer',cat:'Transfer',acct:'a1',transferTo:'a2',
  }]}
  const result=applyRecordOperation(transferFinance, {
    type:'recurring.update',targetId:'phone',targetDate:'2026-09-10',
    payload:{transactionType:'expense',category:'Utilities',transferAccountId:''},
    selectedScope:'this-and-future',
  }, ()=>'converted-record')
  const converted=result.after.transactions.find(item=>item.id==='converted-record')
  assert.equal(converted.type,'expense')
  assert.equal(converted.cat,'Utilities')
  assert.equal(converted.transferTo,'')

  assert.throws(() => normalizeActionProposal({operations:[{
    type:'recurring.create',description:'Create scheduled phone expense',targetDate:'2026-09-10',
    payload:{title:'Phone',amount:400,transactionType:'expense',frequency:'monthly',accountId:'a1',date:'2026-09-11'},
  }]},{member:'Larry',role:'admin'}), /must match the exact reviewed date/)
})

test('reviewed scheduled creation uses CAS, immutable audit history, and safe Undo', async () => {
  const store=versionedBlobStore(),repository=createAssistantActionRepository({store,householdId:'scheduled-house',now:()=>new Date('2026-09-07T12:00:00Z')})
  const resources=versionedFinanceResources(baseFinance,3)
  const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin')
  const input={
    summary:'Create scheduled paycheck',expectedVersion:3,
    operation:{type:'recurring.create',description:'Create the scheduled cash-plan record for paycheck',targetDate:'2026-09-11',payload:{title:'Paycheck',amount:2500,transactionType:'income',frequency:'monthly',accountId:'a1',category:'Income'}},
  }
  const proposal=await prepareDirectProposal({input,session,permissions,repository,resources,now:new Date('2026-09-07T12:00:00Z'),id:'scheduled-create'})
  assert.equal(proposal.expectedVersions['shared:lslj_finance_v9'],3)
  assert.equal(resources.snapshot().value.transactions.length,1,'preparing a review must not mutate the plan')

  const executed=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T12:01:00Z')})
  const created=resources.snapshot().value.transactions.find(item=>item.name==='Paycheck')
  assert.equal(created.amount,2500)
  assert.equal(created.start,'2026-09-11')
  assert.equal(executed.audit.actor,'Larry')
  assert.equal(executed.audit.undoAvailable,true)
  assert.equal(executed.audit.changes[0].before.transactions.length,1)
  assert.equal(executed.audit.changes[0].after.transactions.length,2)

  await undoActionWithJournal({repository,auditId:executed.audit.id,session,resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T12:02:00Z')})
  assert.equal(resources.snapshot().value.transactions.length,1)
  assert.equal((await repository.getAudit(executed.audit.id)).undoAvailable,false)
})

test('scheduled review rejects stale versions and non-administrators', async () => {
  const repository={saveProposal:async proposal=>proposal}
  const resources=versionedFinanceResources(baseFinance,4)
  const input={summary:'Update phone plan',expectedVersion:3,operation:{type:'recurring.update',targetId:'phone',targetDate:'2026-09-10',description:'Update the scheduled phone record',payload:{amount:450},allowedScopes:['this-item','this-and-future'],defaultScope:'this-item'}}
  await assert.rejects(()=>prepareDirectProposal({input,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources}),error=>error.code==='VERSION_CONFLICT')
  await assert.rejects(()=>prepareDirectProposal({input:{...input,expectedVersion:4},session:{member:'Lorenzo',role:'member'},permissions:{...defaultActionPermissions('member'),finance:true},repository,resources}),error=>error.code==='FORBIDDEN')
})

test('all scheduled add, edit, delete, scope, and drag paths stage Action Mode instead of directly saving', () => {
  assert.match(plannerSource, /type:isCreate \? 'recurring\.create' : 'recurring\.update'/)
  assert.match(plannerSource, /type:'recurring\.delete'/)
  assert.match(plannerSource, /getAcknowledgedSharedStateVersion\(localStorage, storageKey\)/)
  assert.match(plannerSource, /await syncSharedState\(localStorage\)/)
  assert.match(plannerSource, /catch \{ return undefined \}/)
  assert.doesNotMatch(plannerSource, /catch \{ return -1 \}/)
  assert.doesNotMatch(plannerSource, /Close it, refresh, and review the current record/)
  assert.match(plannerSource, /saved\._reviewVersion = openedVersion/)
  assert.match(plannerSource, /Object\.hasOwn\(tx \|\| \{\}, '_reviewVersion'\)/)
  assert.match(plannerSource, /setDragTx\(\{ tx:\{ \.\.\.tx, _reviewVersion:captureFinanceReviewVersion\(\) \}/)
  assert.match(plannerSource, /deleteTx\(insightEditTx\)/)
  assert.match(plannerSource, /calendarApplyScopedChange/)
  assert.match(plannerSource, /calendarMoveTx/)
  assert.doesNotMatch(plannerSource, /calendarBatchSave|calendarApplyChanges/)
  assert.doesNotMatch(plannerSource, /setDataAndPersist|function saveData\s*\(/)
  assert.doesNotMatch(plannerSource, /const deleteTx = \(id\) => \{\s*if \(!window\.confirm/)
})

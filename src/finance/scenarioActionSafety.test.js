import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { defaultActionPermissions } from '../../netlify/lib/assistant-action-contract.mjs'
import {
  executeActionWithJournal,
  prepareDirectProposal,
  undoActionWithJournal,
} from '../../netlify/functions/brevity-assistant-actions.mjs'

const component=readFileSync(new URL('./ScenarioModeling.jsx',import.meta.url),'utf8')
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value))

function memoryRepository(){
  const journals=new Map(),audits=new Map(),proposals=new Map()
  return{
    proposals,journals,audits,
    async saveProposal(proposal){proposals.set(proposal.id,clone(proposal));return clone(proposal)},
    async getJournalEntry(id){return{journal:clone(journals.get(id)||null)}},
    async ensureJournal(journal){if(!journals.has(journal.id))journals.set(journal.id,clone(journal));return clone(journals.get(journal.id))},
    async updateJournal(id,updater){
      const current=clone(journals.get(id));if(!current)throw new Error('missing journal')
      const next=updater(current);journals.set(id,clone(next));return clone(next)
    },
    async getAudit(id){return clone(audits.get(id)||null)},
    async addAudit(audit){if(!audits.has(audit.id))audits.set(audit.id,clone(audit));return clone(audits.get(audit.id))},
    async markAuditUndone(id,patch){
      const current=audits.get(id);if(!current)throw new Error('missing audit')
      const next={...current,...clone(patch),undoAvailable:false};audits.set(id,next);return clone(next)
    },
  }
}

function versionedForecastResources(initial,version=3){
  let state={value:clone(initial),version,record:{version,lastActionId:''}}
  return{
    snapshot:()=>clone(state),
    async read(resource){assert.equal(resource,'shared:brevity_finance_scenarios_v1');return clone(state)},
    async write(resource,value,expectedVersion,actor,mutationId=''){
      assert.equal(resource,'shared:brevity_finance_scenarios_v1')
      if(state.version!==expectedVersion)throw Object.assign(new Error('version conflict'),{code:'VERSION_CONFLICT'})
      state={value:clone(value),version:state.version+1,record:{version:state.version+1,updatedBy:actor,lastActionId:mutationId}}
      return clone(state)
    },
  }
}

test('Scenario Modeling never persists or claims a forecast change before Action Mode approval',()=>{
  assert.match(component,/prepareDirectAction\(\{ summary, operation, expectedVersion \}\)/)
  assert.match(component,/requestActionReview\(result\.proposal\)/)
  assert.match(component,/getAcknowledgedSharedStateVersion\(localStorage, SCENARIO_STORAGE_KEY\)/)
  assert.match(component,/window\.addEventListener\(SHARED_STATE_EVENT, refresh\)/)
  assert.match(component,/Draft only — review and approve before Brevity changes the forecast\./)
  assert.match(component,/No forecast value changes until you approve it\./)
  assert.match(component,/calculateScenario\(activeDraft, expense\)/,'preview totals must recalculate drafts without persisting them')
  assert.doesNotMatch(component,/localStorage\.setItem\(SCENARIO_STORAGE_KEY/)
  assert.doesNotMatch(component,/saveModel\(/)
  assert.doesNotMatch(component,/window\.confirm\(/)
  assert.match(component,/incomeAction:'create'/)
  assert.match(component,/incomeAction:'delete'/)
  assert.match(component,/Review expense total/)
  assert.match(component,/prepareDirectAction\(\{ summary, operation, expectedVersion \}\)/,'income and expense mutations must retain Action Mode review')
})

test('direct forecast review captures CAS, audits the exact record, and safely undoes',async()=>{
  const initial={
    expenseMode:'scenario',planningExpense:20000,
    scenarios:[{id:'current',title:'Current',description:'Today',incomes:[{id:'salary',description:'Salary',monthlyNet:5000,annualGross:80000,contribution:8,remote:true,employment:'Perm',notes:''}]}],
  }
  const repository=memoryRepository(),resources=versionedForecastResources(initial,3)
  const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin')
  const now=()=>new Date('2026-09-07T16:00:00.000Z')
  const input={
    summary:'Update Salary forecast assumptions',expectedVersion:3,
    operation:{type:'forecast.update',targetId:'current',description:'Change Salary monthly net.',payload:{incomeId:'salary',monthlyNet:5500}},
  }
  const proposal=await prepareDirectProposal({input,session,permissions,repository,resources,now:now(),id:'forecast-proposal'})
  assert.equal(proposal.expectedVersions['shared:brevity_finance_scenarios_v1'],3)
  assert.equal(resources.snapshot().value.scenarios[0].incomes[0].monthlyNet,5000,'review preparation must not mutate the forecast')

  const execution=await executeActionWithJournal({
    repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,
    createAttemptId:()=> 'forecast-execute-attempt',
  })
  assert.equal(resources.snapshot().value.scenarios[0].incomes[0].monthlyNet,5500)
  assert.equal(execution.audit.actor,'Larry')
  assert.equal(execution.audit.undoAvailable,true)
  assert.equal(execution.audit.changes[0].before.scenarios[0].incomes[0].monthlyNet,5000)
  assert.equal(execution.audit.changes[0].after.scenarios[0].incomes[0].monthlyNet,5500)

  await undoActionWithJournal({
    repository,auditId:execution.audit.id,session,resources,event:{},now,
    createAttemptId:()=> 'forecast-undo-attempt',
  })
  assert.equal(resources.snapshot().value.scenarios[0].incomes[0].monthlyNet,5000)
  assert.equal((await repository.getAudit(execution.audit.id)).undoAvailable,false)
})

test('direct forecast review stops before review when a newer shared version exists',async()=>{
  const model={expenseMode:'scenario',planningExpense:20000,scenarios:[{id:'current',title:'Current',description:'Today',incomes:[]}]}
  const repository=memoryRepository(),resources=versionedForecastResources(model,4)
  await assert.rejects(()=>prepareDirectProposal({
    input:{summary:'Stale edit',expectedVersion:3,operation:{type:'forecast.update',targetId:'model',description:'Change baseline.',payload:{planningExpense:21000}}},
    session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources,
    now:new Date('2026-09-07T16:00:00.000Z'),id:'stale-forecast-proposal',
  }),error=>error?.code==='VERSION_CONFLICT')
  assert.equal(repository.proposals.size,0)
  assert.equal(resources.snapshot().value.planningExpense,20000)
})

test('recovery scenario save is versioned, owned, audited, isolated and undoable',async()=>{
  const {RECOVERY_DEFAULT,RECOVERY_ID}=await import('./recoveryScenario.js')
  const initial={expenseMode:'scenario',planningExpense:20000,scenarios:[]}
  const repository=memoryRepository(),resources=versionedForecastResources(initial,3)
  const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin'),now=()=>new Date('2026-10-15T12:00:00Z')
  const input={summary:'Save recovery assumptions',expectedVersion:3,operation:{type:'forecast.update',targetId:RECOVERY_ID,payload:{recoveryJson:JSON.stringify(RECOVERY_DEFAULT)}}}
  const proposal=await prepareDirectProposal({input,session,permissions,repository,resources,now:now(),id:'recovery-save'})
  assert.deepEqual(resources.snapshot().value,initial)
  const execution=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,createAttemptId:()=> 'recovery-attempt'})
  const plan=resources.snapshot().value.recoveryPlans[0]
  assert.equal(plan.owner,'Larry');assert.equal(plan.version,1);assert.equal(plan.classification,'hypothetical')
  assert.deepEqual(plan.assumptions,RECOVERY_DEFAULT)
  assert.equal(plan.history.length,1)
  assert.equal(execution.audit.actor,'Larry')
  await undoActionWithJournal({repository,auditId:execution.audit.id,session,resources,event:{},now,createAttemptId:()=> 'recovery-undo'})
  assert.deepEqual(resources.snapshot().value,initial)
})

test('worksheet save preserves the Vizient plan and supports audited Undo',async()=>{
  const {RECOVERY_DEFAULT,RECOVERY_ID}=await import('./recoveryScenario.js')
  const {createRecoveryWorksheet,WORKSHEET_ID}=await import('./recoveryWorksheet.js')
  const assumptions={...RECOVERY_DEFAULT,worksheet:createRecoveryWorksheet()}
  const initial={expenseMode:'scenario',planningExpense:20000,scenarios:[],recoveryPlans:[{id:RECOVERY_ID,title:'Existing Vizient plan',assumptions:RECOVERY_DEFAULT}]}
  const repository=memoryRepository(),resources=versionedForecastResources(initial,3)
  const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin'),now=()=>new Date('2026-10-15T12:00:00Z')
  const input={summary:'Save recovery assumptions',expectedVersion:3,operation:{type:'forecast.update',targetId:WORKSHEET_ID,payload:{recoveryJson:JSON.stringify(assumptions)}}}
  const proposal=await prepareDirectProposal({input,session,permissions,repository,resources,now:now(),id:'recovery-save'})
  assert.deepEqual(resources.snapshot().value,initial)
  const execution=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,createAttemptId:()=> 'recovery-attempt'})
  const plan=resources.snapshot().value.recoveryPlans[1]
  assert.equal(plan.owner,'Larry');assert.equal(plan.version,1);assert.equal(plan.classification,'hypothetical')
  assert.deepEqual(plan.assumptions,assumptions)
  assert.deepEqual(resources.snapshot().value.recoveryPlans[0],initial.recoveryPlans[0])
  assert.equal(plan.history.length,1)
  assert.equal(execution.audit.actor,'Larry')
  await undoActionWithJournal({repository,auditId:execution.audit.id,session,resources,event:{},now,createAttemptId:()=> 'recovery-undo'})
  assert.deepEqual(resources.snapshot().value,initial)
})

test('October 15 pending and priced models retain drivers through approved saves and Undo',async()=>{
  const {createWorkScenario}=await import('./workScenarios.js')
  for(const id of ['recovery-oct15-phoenix','recovery-oct15-expedite']) {
    const assumptions=createWorkScenario(id),initial={expenseMode:'scenario',planningExpense:20000,scenarios:[]}
    const repository=memoryRepository(),resources=versionedForecastResources(initial,3)
    const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin'),now=()=>new Date('2026-10-15T12:00:00Z')
    const input={summary:'Save October 15 model',expectedVersion:3,operation:{type:'forecast.update',targetId:id,payload:{recoveryJson:JSON.stringify(assumptions)}}}
    const proposal=await prepareDirectProposal({input,session,permissions,repository,resources,now:now(),id:'opportunity-save'})
    assert.deepEqual(resources.snapshot().value,initial)
    const execution=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,createAttemptId:()=> 'opportunity-attempt'})
    const plan=resources.snapshot().value.recoveryPlans[0]
    assert.equal(plan.owner,'Larry');assert.equal(plan.version,1);assert.equal(plan.classification,'hypothetical')
    assert.deepEqual(plan.assumptions,assumptions)
    await undoActionWithJournal({repository,auditId:execution.audit.id,session,resources,event:{},now,createAttemptId:()=> 'opportunity-undo'})
    assert.deepEqual(resources.snapshot().value,initial)
  }
})


test('reviewed scenario expense changes stay isolated and support undo',async()=>{
 const initial={expenseMode:'scenario',planningExpense:2000,scenarios:[{id:'one',planningExpense:1000,incomes:[]},{id:'two',planningExpense:3000,incomes:[]}]}
 const repository=memoryRepository(),resources=versionedForecastResources(initial,3)
 const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin'),now=()=>new Date('2026-10-31T00:00:00Z')
 const proposal=await prepareDirectProposal({input:{summary:'Change one scenario expense',expectedVersion:3,operation:{type:'forecast.update',targetId:'one',payload:{planningExpense:1500}}},session,permissions,repository,resources,now:now(),id:'scenario-expense'})
 assert.deepEqual(resources.snapshot().value,initial)
 const execution=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,createAttemptId:()=> 'expense-execute'})
 assert.equal(resources.snapshot().value.scenarios[0].planningExpense,1500)
 assert.equal(resources.snapshot().value.scenarios[1].planningExpense,3000)
 assert.equal(resources.snapshot().value.planningExpense,2000)
 await undoActionWithJournal({repository,auditId:execution.audit.id,session,resources,event:{},now,createAttemptId:()=> 'expense-undo'})
 assert.deepEqual(resources.snapshot().value,initial)
})

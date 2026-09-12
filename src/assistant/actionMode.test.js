import assert from 'node:assert/strict'
import test from 'node:test'
import { actionRisk, defaultActionPermissions, normalizeActionProposal, normalizePermissionMatrix, permissionForOperation, selectedOperation } from '../../netlify/lib/assistant-action-contract.mjs'
import { applyRecordOperation, captureExpectedVersions, createProductionActionResources, executeRecordOperations, resourceForOperation } from '../../netlify/lib/assistant-action-executor.mjs'
import { createEmptyDailyPlan } from '../household/dailyPlan.js'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { assertExecutableProposalVersions, calendarVersion, commitPreparedCalendarOperations, createPermissionActionResources, executeActionWithJournal, prepareCalendarProposal, prepareDirectProposal, prepareMealProposal, publicAssistantAudit, reviewedExecutionSession, savePermissionsWithJournal, unchangedSinceAction, undoActionWithJournal, undoAudit } from '../../netlify/functions/brevity-assistant-actions.mjs'
import { createMealPlanRepository } from '../../netlify/lib/meal-plan-store.mjs'
import { MEAL_LIBRARY } from '../meals/mealLibrary.js'
import { hashValue } from '../household/sharedState.js'

function versionedBlobStore() {
  const values=new Map()
  let sequence=0,historyFailures=0
  const clone=value=>value==null?value:structuredClone(value)
  return{
    values,
    failNextHistoryWrites(count){historyFailures=count},
    async get(key){return clone(values.get(key)?.data??null)},
    async getWithMetadata(key){const entry=values.get(key);return entry?{data:clone(entry.data),etag:entry.etag}:null},
    async setJSON(key,value,options={}){
      const current=values.get(key)
      if(key.endsWith('/history')&&historyFailures>0){historyFailures-=1;return{modified:false}}
      if(options.onlyIfNew&&current)return{modified:false,etag:current.etag}
      if(options.onlyIfMatch&&current?.etag!==options.onlyIfMatch)return{modified:false,etag:current?.etag||null}
      const etag=`etag-${++sequence}`
      values.set(key,{data:clone(value),etag})
      return{modified:true,etag}
    },
  }
}

test('action proposals accept only the explicit Brevity tool allowlist',()=>{
  const proposal=normalizeActionProposal({summary:'Update the decision',operations:[{type:'decision.update',description:'Assign the open decision to Larry',targetId:'d1',targetDate:'2026-09-05',payloadJson:'{"owner":"Larry","status":"determined"}',allowedScopes:['this-item'],defaultScope:'this-item'}]},{member:'Larry',role:'admin',now:new Date('2026-09-05T10:00:00Z'),id:'proposal-1'})
  assert.equal(proposal.operations[0].payload.owner,'Larry')
  assert.equal(proposal.risk,'confirmation')
  assert.throws(()=>normalizeActionProposal({operations:[{type:'payment.send',payloadJson:'{}'}]},{member:'Larry'}),/Unsupported assistant action/)
})

test('each action accepts only its own fields and validates field types and enums',()=>{
  const base={description:'Reviewed change',targetId:'record-1',targetDate:'2026-09-05'}
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'decision.update',payload:{status:'determined',amount:25}}]},{member:'Larry',role:'admin'}),/unsupported field: amount/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'calendar.update',payload:{title:'Dinner',status:'complete'}}]},{member:'Larry',role:'admin'}),/unsupported field: status/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'decision.update',payload:{status:'approved'}}]},{member:'Larry',role:'admin'}),/status is not valid/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'project.update',payload:{status:'complete'}}]},{member:'Larry',role:'admin'}),/status is not valid/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'calendar.update',payload:{allDay:'false'}}]},{member:'Larry',role:'admin'}),/allDay to be true or false/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'calendar.create',targetDate:'2026-09-05',payload:{title:'Dinner',date:'2026-09-05',allDay:false}}]},{member:'Larry',role:'admin'}),/requires an exact time/)
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,type:'calendar.create',targetDate:'2026-09-05',payload:{title:'Dinner',date:'2026-09-05',time:'7:00 PM',allDay:false}}]},{member:'Larry',role:'admin'}))
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'assignment.update',payload:{participants:'Nyla'}}]},{member:'Larry',role:'admin'}),/participants to be a list/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'project.update',payload:{raci:{responsible:['Unknown']}}}]},{member:'Larry',role:'admin'}),/unrecognized RACI member/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'budget.update',payload:{month:'8',value:100}}]},{member:'Larry',role:'admin'}),/month must be a valid number/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'recurring.delete',payload:{notes:'foreign'}}]},{member:'Larry',role:'admin'}),/unsupported field: notes/)
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,type:'forecast.update',targetId:'expenseMode',payload:{expenseMode:'operating'}}]},{member:'Larry',role:'admin'}))
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'forecast.update',targetId:'expenseMode',payload:{expenseMode:'budget'}}]},{member:'Larry',role:'admin'}),/expenseMode is not valid/)
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,type:'forecast.update',targetId:'current',payload:{incomeAction:'create',incomeId:'new-income',description:'New role',monthlyNet:5000,annualGross:80000,contribution:8,remote:true}}]},{member:'Larry',role:'admin'}))
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,type:'forecast.update',targetId:'current',payload:{incomeAction:'delete',incomeId:'old-income'}}]},{member:'Larry',role:'admin'}))
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'forecast.update',targetId:'current',payload:{incomeAction:'create',incomeId:'new-income',monthlyNet:5000}}]},{member:'Larry',role:'admin'}),/requires a unique id, description/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'forecast.update',targetId:'current',payload:{incomeAction:'delete',incomeId:'old-income',monthlyNet:1}}]},{member:'Larry',role:'admin'}),/requires only its exact income id/)
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,type:'transaction.update',payload:{name:'AT&T',category:'Phone'}}]},{member:'Larry',role:'admin'}))
  const historicalRule=normalizeActionProposal({operations:[{...base,type:'transaction.rule.create',payload:{title:'Coffee',matchText:'STARBUCKS',matchField:'merchantName',matchMode:'starts',category:'Coffee',accountId:'operating',applyToExisting:true,createdDate:'2026-09-05'}}]},{member:'Larry',role:'admin'})
  assert.equal(historicalRule.risk,'strong-confirmation')
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,type:'transaction.rule.delete',payload:{}}]},{member:'Larry',role:'admin'}))
  for (const field of ['amount','date','originalStatement','notes','goal','splits','needsReview']) {
    assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'transaction.update',payload:{name:'AT&T',[field]:field==='amount'?450:'changed'}}]},{member:'Larry',role:'admin'}),new RegExp(`unsupported field: ${field}`))
  }
})

test('reviewed budget changes stay isolated to one stable line, account, year, and month',()=>{
  const payload={
    month:8,
    year:2026,
    value:450,
    lineId:'operating:phone',
    recordId:'phone',
    lineName:'Cell phones',
    category:'Utilities',
    direction:'expense',
    accountId:'operating',
    legacyYear:2026,
    legacyAccountId:'operating',
  }
  const proposal=normalizeActionProposal({operations:[{
    type:'budget.update',
    description:'Set the September cell-phone budget',
    targetId:'operating:phone',
    targetDate:'2026-09-01',
    payload,
  }]},{member:'Larry',role:'admin'})
  const operation=proposal.operations[0]
  const {after}=applyRecordOperation({},operation)
  assert.equal(after.targets.operating['2026']['operating:phone'][8],450)
  assert.equal(after.lines['operating:phone'].recordId,'phone')
  assert.throws(()=>normalizeActionProposal({operations:[{
    ...operation,
    targetId:'operating:another-line',
    payload,
  }]},{member:'Larry',role:'admin'}),/exact stable line and account ids/)
})

test('reviewed actions reject empty or selector-only payloads that cannot change a record',()=>{
  const base={description:'Reviewed change',targetId:'record-1',targetDate:'2026-09-05'}
  for (const type of ['decision.create','decision.update','assignment.create','assignment.update','project.create','project.update','calendar.update','recurring.update']) {
    assert.throws(()=>normalizeActionProposal({operations:[{...base,type,payload:{}}]},{member:'Larry',role:'admin'}),/at least one reviewed change/)
  }
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'transaction.categorize',payload:{category:''}}]},{member:'Larry',role:'admin'}),/category is required/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'transaction.update',payload:{}}]},{member:'Larry',role:'admin'}),/at least one reviewed change/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'transaction.rule.delete',targetId:'',payload:{}}]},{member:'Larry',role:'admin'}),/exact record id/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'budget.update',payload:{month:8}}]},{member:'Larry',role:'admin'}),/numeric value/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,type:'forecast.update',payload:{incomeId:'income-1'}}]},{member:'Larry',role:'admin'}),/at least one supported reviewed income change/)
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,type:'recurring.delete',payload:{}}]},{member:'Larry',role:'admin'}))
})

test('a confirmation cannot mix independently versioned record groups',()=>{
  assert.throws(()=>normalizeActionProposal({operations:[
    {type:'decision.update',description:'Close decision',targetId:'d1',targetDate:'2026-09-05',payloadJson:'{"status":"complete"}'},
    {type:'project.update',description:'Close project',targetId:'p1',payloadJson:'{"status":"Done"}'},
  ]},{member:'Larry',role:'admin'}),/one Brevity record group/)
})

test('one confirmation cannot partially apply multiple Apple Calendar changes',()=>{
  assert.throws(()=>normalizeActionProposal({operations:[
    {type:'calendar.create',description:'First event',targetDate:'2026-09-08',payloadJson:'{"title":"First","date":"2026-09-08"}'},
    {type:'calendar.create',description:'Second event',targetDate:'2026-09-09',payloadJson:'{"title":"Second","date":"2026-09-09"}'},
  ]},{member:'Larry',role:'admin'}),/only one event/)
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

test('administrator recovery preserves the role of the member who reviewed the proposal',()=>{
  const recovered=reviewedExecutionSession({member:'Larry',role:'admin'},{startedBy:'Nyla',startedRole:'member'})
  assert.equal(recovered.member,'Nyla')
  assert.equal(recovered.role,'member')
  assert.throws(()=>reviewedExecutionSession({member:'Larry',role:'admin'},{startedBy:'Nyla'}),error=>error.code==='VERSION_CONFLICT')
})

test('project updates authorize responsible and accountable members but not unassigned records',()=>{
  const operation={domain:'projects',type:'project.update',payload:{title:'Reviewed'}}
  const permissions=defaultActionPermissions('member')
  const raci={responsible:['Nyla'],accountable:['Lorenzo'],consulted:['Terica'],informed:[]}
  assert.equal(permissionForOperation({operation,member:'Nyla',role:'member',permissions,currentRecord:{raci}}).allowed,true)
  assert.equal(permissionForOperation({operation,member:'Lorenzo',role:'member',permissions,currentRecord:{raci}}).allowed,true)
  assert.equal(permissionForOperation({operation,member:'Terica',role:'member',permissions,currentRecord:{raci}}).allowed,false)
  assert.equal(permissionForOperation({operation,member:'Javin',role:'member',permissions,currentRecord:{raci:{responsible:[],accountable:[]}}}).allowed,false)
  assert.equal(permissionForOperation({operation,member:'Javin',role:'admin',permissions,currentRecord:{raci:{responsible:[],accountable:[]}}}).allowed,true)
  assert.equal(permissionForOperation({operation:{domain:'projects',type:'project.create',payload:{raci:{responsible:['Lorenzo'],accountable:[]}}},member:'Nyla',role:'member',permissions}).allowed,false)
  assert.equal(permissionForOperation({operation:{domain:'projects',type:'project.create',payload:{raci:{responsible:[],accountable:[]}}},member:'Nyla',role:'member',permissions}).allowed,false)
  assert.equal(permissionForOperation({operation:{domain:'projects',type:'project.create',payload:{raci:{responsible:['Lorenzo'],accountable:['Nyla']}}},member:'Nyla',role:'member',permissions}).allowed,true)
})

test('member-facing audit history omits stored before and after snapshots',()=>{
  const visible=publicAssistantAudit({id:'a1',summary:'Updated budget',actor:'Larry',changes:[{before:{salary:1},after:{salary:2}}],operations:[{id:'o1',type:'budget.update',domain:'finance',description:'Update budget',selectedScope:'this-item'}],undoAvailable:true})
  assert.equal('changes' in visible,false)
  assert.deepEqual(visible.operations[0],{id:'o1',type:'budget.update',domain:'finance',description:'Update budget',selectedScope:'this-item'})
})

test('Undo stops whenever a newer record version exists, even if values look unchanged',()=>{
  const change={afterVersion:4,after:{transactions:[{id:'r1',notes:'test'}]}}
  assert.equal(unchangedSinceAction({version:4,value:{transactions:[{id:'r1',notes:'test'}]}},change),true)
  assert.equal(unchangedSinceAction({version:5,value:{transactions:[{id:'r1',notes:'test'}]}},change),false)
  assert.equal(unchangedSinceAction({version:5,value:{transactions:[{id:'r1',notes:'newer edit'}]}},change),false)
})

test('record executor updates decisions and preserves a complete before image',()=>{
  const original={decisions:[{id:'d1',title:'Choose vendor',owner:'Larry',status:'needs-decision'}]}
  const result=applyRecordOperation(original,{type:'decision.update',targetId:'d1',payload:{status:'complete',notes:'Approved'}})
  assert.equal(result.after.decisions[0].status,'complete')
  assert.equal(result.before.decisions[0].status,'needs-decision')
  assert.equal(original.decisions[0].status,'needs-decision')
})

test('Action Mode creates decisions and future-only categorization rules',()=>{
  const plan=applyRecordOperation(createEmptyDailyPlan('2026-09-05'),{type:'decision.create',targetDate:'2026-09-05',description:'Choose contractor',payload:{title:'Choose contractor',owner:'Larry'}},()=> 'decision-1')
  assert.equal(plan.after.decisions[0].id,'decision-1')
  const rules=applyRecordOperation([],{type:'transaction.rule.create',payload:{title:'Future coffee',matchText:'STARBUCKS',matchField:'merchantName',matchMode:'starts',category:'Dining',accountId:'operating',applyToExisting:true,createdDate:'2026-09-05'}},()=> 'rule-1')
  assert.deepEqual(rules.after[0],{id:'rule-1',name:'Future coffee',createdDate:'2026-09-05',applyToExisting:true,conditions:{originalStatement:{on:false,match:'starts',value:'STARBUCKS'},merchantName:{on:true,match:'starts',value:'STARBUCKS'},accounts:{on:true,value:'operating'}},actions:{updateCategory:{on:true,value:'Dining'}},splits:[]})
  const removed=applyRecordOperation(rules.after,{type:'transaction.rule.delete',targetId:'rule-1',payload:{}})
  assert.deepEqual(removed.after,[])
})

test('forecast adjustments update only an exact model or scenario record',()=>{
  const model={expenseMode:'scenario',planningExpense:20000,scenarios:[{id:'current',title:'Current',description:'Today',incomes:[{id:'salary',description:'Salary',monthlyNet:5000,annualGross:80000,remote:true}]}]}
  const expense=applyRecordOperation(model,{type:'forecast.update',targetId:'planningExpense',payload:{planningExpense:21000}})
  assert.equal(expense.after.planningExpense,21000)
  const income=applyRecordOperation(model,{type:'forecast.update',targetId:'current',payload:{incomeId:'salary',monthlyNet:5500,notes:'Reviewed'}})
  assert.equal(income.after.scenarios[0].incomes[0].monthlyNet,5500)
  assert.equal(income.after.scenarios[0].incomes[0].notes,'Reviewed')
  const renamed=applyRecordOperation(model,{type:'forecast.update',targetId:'current',payload:{incomeId:'salary',description:'Primary salary'}})
  assert.equal(renamed.after.scenarios[0].incomes[0].description,'Primary salary')
  const added=applyRecordOperation(model,{type:'forecast.update',targetId:'current',payload:{incomeAction:'create',incomeId:'consulting',description:'Consulting',monthlyNet:4000,annualGross:60000,contribution:5,remote:true,employment:'Contract',notes:''}})
  assert.equal(added.after.scenarios[0].incomes.at(-1).description,'Consulting')
  assert.equal(added.after.scenarios[0].incomes.length,2)
  const removed=applyRecordOperation(added.after,{type:'forecast.update',targetId:'current',payload:{incomeAction:'delete',incomeId:'consulting'}})
  assert.deepEqual(removed.after.scenarios[0].incomes.map(row=>row.id),['salary'])
  assert.equal(model.scenarios[0].incomes[0].monthlyNet,5000)
  const operating=applyRecordOperation(model,{type:'forecast.update',targetId:'expenseMode',payload:{expenseMode:'operating'}})
  assert.equal(operating.after.expenseMode,'operating')
  assert.throws(()=>applyRecordOperation(model,{type:'forecast.update',targetId:'expenseMode',payload:{expenseMode:'budget'}}),/scenario or operating/)
  assert.throws(()=>applyRecordOperation(model,{type:'forecast.update',targetId:'current',payload:{incomeId:'missing',monthlyNet:1}}),/income record no longer exists/)
  assert.throws(()=>applyRecordOperation(model,{type:'forecast.update',targetId:'current',payload:{incomeAction:'create',incomeId:'salary',description:'Duplicate'}}),/already exists/)
  assert.throws(()=>applyRecordOperation(model,{type:'forecast.update',targetId:'current',payload:{incomeAction:'delete',incomeId:'missing'}}),/no longer exists/)
  assert.equal(resourceForOperation({type:'forecast.update',domain:'finance'}),'shared:brevity_finance_scenarios_v1')
})

test('meal substitutions require a dated, same-category library choice',()=>{
  const breakfast=MEAL_LIBRARY.find(meal=>meal.mealType==='breakfast')
  const dinner=MEAL_LIBRARY.find(meal=>meal.mealType==='dinner')
  const base={type:'meal.substitute',description:'Replace dinner',targetId:'current-dinner',targetDate:'2026-09-07'}
  assert.doesNotThrow(()=>normalizeActionProposal({operations:[{...base,payload:{mealType:'dinner',mealId:dinner.id}}]},{member:'Larry',role:'admin'}))
  assert.throws(()=>normalizeActionProposal({operations:[{...base,payload:{mealType:'dinner',mealId:breakfast.id}}]},{member:'Larry',role:'admin'}),/not a dinner option/)
  assert.throws(()=>normalizeActionProposal({operations:[{...base,targetDate:'',payload:{mealType:'dinner',mealId:dinner.id}}]},{member:'Larry',role:'admin'}),/exact occurrence date/)
})

test('reviewed meal replacement recovers a lost response, audits once, and safely undoes',async()=>{
  const date='2026-09-07',instant=new Date('2026-09-07T12:00:00Z')
  const actionStore=versionedBlobStore(),mealStore=versionedBlobStore()
  const repository=createAssistantActionRepository({store:actionStore,householdId:'house',now:()=>instant})
  const mealRepository=createMealPlanRepository({store:mealStore,householdId:'lslj-family',now:()=>instant})
  const day=await mealRepository.ensureDay(date)
  const replacement=MEAL_LIBRARY.find(meal=>meal.mealType==='dinner'&&meal.id!==day.meals.dinner)
  const proposal=await prepareMealProposal({
    input:{date,mealType:'dinner',mealId:replacement.id,expectedVersion:day.version},
    session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,mealRepository,now:instant,id:'meal-proposal',
  })
  assert.equal(proposal.expectedVersions[`meal:${date}`],1)
  assert.match(proposal.operations[0].description,/Replace .+ with .+/)

  const originalSet=mealStore.setJSON.bind(mealStore);let loseResponse=true,writes=0
  mealStore.setJSON=async(key,value,options)=>{
    const result=await originalSet(key,value,options)
    if(key.endsWith(`/days/${date}`)&&options?.onlyIfMatch){writes+=1;if(loseResponse){loseResponse=false;throw new Error('meal response lost')}}
    return result
  }
  const resources=createProductionActionResources({sharedStore:mealStore,planStore:mealStore,mealStore,now:()=>instant})
  const input={repository,proposal,operations:proposal.operations,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0,now:()=>instant}
  await assert.rejects(()=>executeActionWithJournal(input),/meal response lost/)
  const completed=await executeActionWithJournal(input)
  assert.equal(writes,1)
  assert.equal((await mealRepository.getDay(date)).meals.dinner,replacement.id)
  assert.equal((await repository.history()).filter(item=>item.id===completed.audit.id).length,1)

  const undone=await undoActionWithJournal({repository,auditId:completed.audit.id,session:{member:'Larry',role:'admin'},resources,event:{},leaseMs:0,now:()=>instant})
  assert.equal(undone.audit.action,'undo')
  assert.equal((await mealRepository.getDay(date)).meals.dinner,day.meals.dinner)
  assert.equal((await repository.getAudit(completed.audit.id)).undoAvailable,false)
})

test('meal review previews a missing day without writing and creates it only when the reviewed action executes',async()=>{
  const date='2026-09-08',instant=new Date('2026-09-07T12:00:00Z')
  const actionStore=versionedBlobStore(),mealStore=versionedBlobStore()
  const repository=createAssistantActionRepository({store:actionStore,householdId:'house',now:()=>instant})
  const mealRepository=createMealPlanRepository({store:mealStore,householdId:'lslj-family',now:()=>instant})
  const preview=(await mealRepository.getWindowReadOnly({startDate:date,count:1})).days[0]
  const replacement=MEAL_LIBRARY.find(meal=>meal.mealType==='dinner'&&meal.id!==preview.meals.dinner)
  let mealWrites=0
  const originalSet=mealStore.setJSON.bind(mealStore)
  mealStore.setJSON=async(...args)=>{mealWrites+=1;return originalSet(...args)}
  const proposal=await prepareMealProposal({
    input:{date,mealType:'dinner',mealId:replacement.id,expectedVersion:preview.version},
    session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,mealRepository,now:instant,id:'missing-meal-proposal',
  })
  assert.equal(proposal.expectedVersions[`meal:${date}`],0)
  assert.equal(mealWrites,0,'opening or canceling review must not initialize a meal day')
  assert.equal(await mealRepository.getDay(date),null)
  const resources=createProductionActionResources({sharedStore:mealStore,planStore:mealStore,mealStore,now:()=>instant})
  await executeActionWithJournal({repository,proposal,operations:proposal.operations,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0,now:()=>instant})
  assert.equal(mealWrites,1)
  assert.equal((await mealRepository.getDay(date)).meals.dinner,replacement.id)
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
  const edited=applyRecordOperation(finance,{type:'recurring.update',targetId:'r1',targetDate:'2026-09-11',selectedScope:'this-and-future',payload:{title:'Updated income',category:'Income',frequency:'monthly',endDate:'2026-12-31'}},()=> 'future')
  const editedFuture=edited.after.transactions.find(item=>item.id==='future')
  assert.deepEqual({name:editedFuture.name,cat:editedFuture.cat,freq:editedFuture.freq,end:editedFuture.end},{name:'Updated income',cat:'Income',freq:'monthly',end:'2026-12-31'})
  for (const foreignField of ['title','category','frequency','endDate']) assert.equal(foreignField in editedFuture,false)
  const future=applyRecordOperation(finance,{type:'recurring.delete',targetId:'r1',targetDate:'2026-09-11',selectedScope:'this-and-future',payload:{}})
  assert.equal(future.after.transactions[0].end,'2026-09-10')
})

test('reviewed bank-source linking changes only source identity and preserves the prior balance until verified refresh',()=>{
  const proposal=normalizeActionProposal({summary:'Link Operating Account',operations:[{
    type:'finance.account.link',targetId:'operating',description:'Link Operating Account to Pinnacle ••••0607',payload:{plaidAccountId:'plaid-checking-0607'},
  }]},{member:'Larry',role:'admin'})
  const operation=proposal.operations[0]
  assert.equal(proposal.risk,'strong-confirmation')
  assert.equal(resourceForOperation(operation),'shared:lslj_finance_v9')
  const finance={accounts:[{
    id:'operating',name:'Operating Account',type:'checking',balance:425,
    plaidAccountId:'old-source',plaidItemId:'old-item',plaidName:'Old Checking',plaidType:'depository',plaidSubtype:'checking',institution:'Old Bank',mask:'1111',plaidCurrentBalance:450,plaidAvailableBalance:425,
  },{id:'savings',name:'Savings',type:'savings',balance:900}],transactions:[{id:'mortgage'}]}
  const result=applyRecordOperation(finance,operation)
  const linked=result.after.accounts[0]
  assert.equal(linked.balance,425)
  assert.equal(linked.plaidAccountId,'plaid-checking-0607')
  for(const field of ['plaidItemId','plaidName','plaidType','plaidSubtype','institution','mask','plaidCurrentBalance','plaidAvailableBalance'])assert.equal(field in linked,false)
  assert.deepEqual(result.after.transactions,finance.transactions)
  assert.throws(()=>applyRecordOperation({accounts:[{id:'operating'},{id:'savings',name:'Savings',plaidAccountId:'plaid-checking-0607'}]},operation),/already linked to Savings/)
})

test('execution groups same-record operations into one versioned write',async()=>{
  let value={decisions:[{id:'d1',title:'One',owner:'Larry',status:'needs-decision'},{id:'d2',title:'Two',owner:'Larry',status:'needs-decision'}]},version=3,writes=0
  const resources={read:async()=>({value,version}),write:async(_resource,next,expected)=>{assert.equal(expected,3);writes+=1;value=next;version=4;return{value,version}}}
  const proposal={expectedVersions:{'plan:2026-09-05':3},operations:[{id:'o1',type:'decision.update',domain:'planning',targetId:'d1',targetDate:'2026-09-05',payload:{status:'complete'},allowedScopes:['this-item'],defaultScope:'this-item'},{id:'o2',type:'decision.update',domain:'planning',targetId:'d2',targetDate:'2026-09-05',payload:{status:'deferred'},allowedScopes:['this-item'],defaultScope:'this-item'}]}
  const result=await executeRecordOperations({proposal,selections:{},session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources})
  assert.equal(writes,1);assert.equal(result.changes[0].afterVersion,4);assert.equal(value.decisions[1].status,'deferred');assert.equal(resourceForOperation(proposal.operations[0]),'plan:2026-09-05')
})

test('execution rejects missing or malformed reviewed versions before journals or domain writes',async()=>{
  const operation={id:'unversioned-operation',type:'assignment.create',domain:'planning',targetDate:'2026-09-05',payload:{title:'Unsafe'},allowedScopes:['this-item'],defaultScope:'this-item'}
  let touched=0
  const input={repository:{getJournalEntry:async()=>{touched+=1;return{journal:null}}},proposal:{id:'unversioned',operations:[operation]},operations:[operation],session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources:{read:async()=>{touched+=1;return{value:{assignments:[]},version:0}},write:async()=>{touched+=1}},event:{}}
  await assert.rejects(()=>executeActionWithJournal(input),error=>error.code==='VERSION_CONFLICT')
  assert.equal(touched,0)
  assert.throws(()=>assertExecutableProposalVersions({...input.proposal,expectedVersions:{'plan:2026-09-05':'0'}},[operation]),error=>error.code==='VERSION_CONFLICT')
  const calendarOperation={id:'calendar-unversioned',type:'calendar.create',domain:'calendar',payload:{title:'Dinner',date:'2026-09-05'}}
  assert.throws(()=>assertExecutableProposalVersions({operations:[calendarOperation],expectedVersions:{}},[calendarOperation]),error=>error.code==='VERSION_CONFLICT')
})

test('execution stops when a resource changed after proposal review',async()=>{
  let value={assignments:[]},version=2
  const resources={read:async()=>({value,version}),write:async()=>{throw new Error('must not write')}}
  let proposal={operations:[{id:'o1',type:'assignment.create',domain:'planning',targetDate:'2026-09-05',payload:{title:'Safe'},allowedScopes:['this-item'],defaultScope:'this-item'}]}
  proposal=await captureExpectedVersions(proposal,resources)
  version=3
  await assert.rejects(()=>executeRecordOperations({proposal,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources}),error=>error.code==='VERSION_CONFLICT')
})

test('production resources use an atomic etag condition and reject a concurrent write',async()=>{
  const key='lslj-family/records/homehq_items_v1'
  const initial={key:'homehq_items_v1',value:'[]',version:2,updatedAt:'2026-09-07T10:00:00Z'}
  const sharedStore={
    getWithMetadata:async()=>({data:initial,etag:'etag-v2'}),
    setJSON:async(_key,_value,options)=>{assert.equal(_key,key);assert.deepEqual(options,{onlyIfMatch:'etag-v2'});return{modified:false}},
  }
  const resources=createProductionActionResources({sharedStore,planStore:sharedStore})
  const current=await resources.read('shared:homehq_items_v1')
  assert.equal(current.version,2)
  await assert.rejects(()=>resources.write('shared:homehq_items_v1',[],2,'Larry'),error=>error.code==='VERSION_CONFLICT')
})

test('reviewed shared-record writes preserve the last applied Plaid balance watermark',async()=>{
  const store=versionedBlobStore()
  const key='lslj-family/records/lslj_finance_v9'
  const watermark={issuedAt:200,receiptId:'d'.repeat(64)}
  await store.setJSON(key,{key:'lslj_finance_v9',value:JSON.stringify({accounts:[],transactions:[]}),hash:'seed',version:2,plaidAccountReceipt:watermark})
  const resources=createProductionActionResources({sharedStore:store,planStore:store})
  const next={accounts:[],transactions:[{id:'reviewed'}]}
  await resources.write('shared:lslj_finance_v9',next,2,'Larry','action-1')
  assert.deepEqual(store.values.get(key).data.plaidAccountReceipt,watermark)
  assert.equal(store.values.get(key).data.hash,hashValue(JSON.stringify(next)))
  assert.notEqual(store.values.get(key).data.hash,'assistant-action')
})

test('existing Action resources without an ETag fail closed before every store write',async()=>{
  const store=versionedBlobStore(),date='2026-09-07'
  store.values.set('lslj-family/records/homehq_items_v1',{data:{key:'homehq_items_v1',value:'[]',version:2},etag:null})
  store.values.set(`lslj-family/daily-plans/${date}`,{data:{...createEmptyDailyPlan(date),version:2},etag:null})
  store.values.set(`lslj-family/days/${date}`,{data:{date,version:2,meals:{breakfast:'one',lunch:'two',dinner:'three'}},etag:null})
  const originalSet=store.setJSON.bind(store);let writes=0
  store.setJSON=async(...args)=>{writes+=1;return originalSet(...args)}
  const resources=createProductionActionResources({sharedStore:store,planStore:store,mealStore:store})
  await assert.rejects(()=>resources.write('shared:homehq_items_v1',[],2,'Larry'),error=>error.code==='VERSION_CONFLICT')
  await assert.rejects(()=>resources.write(`plan:${date}`,createEmptyDailyPlan(date),2,'Larry'),error=>error.code==='VERSION_CONFLICT')
  await assert.rejects(()=>resources.write(`meal:${date}`,{date,meals:{breakfast:'one',lunch:'two',dinner:'three'}},2,'Larry'),error=>error.code==='VERSION_CONFLICT')
  assert.equal(writes,0)
})

test('production resources propagate storage outages instead of treating records as missing version zero',async()=>{
  let writes=0
  const unavailable={
    getWithMetadata:async()=>{throw Object.assign(new Error('blob service unavailable'),{status:503})},
    setJSON:async()=>{writes+=1},
  }
  const resources=createProductionActionResources({sharedStore:unavailable,planStore:unavailable})
  await assert.rejects(()=>resources.read('shared:homehq_items_v1'),/blob service unavailable/)
  await assert.rejects(()=>resources.write('plan:2026-09-07',createEmptyDailyPlan('2026-09-07'),0,'Larry'),/blob service unavailable/)
  assert.equal(writes,0)
})

test('reviewed actual-transaction metadata uses CAS, immutable audit history, and safe Undo',async()=>{
  const instant=new Date('2026-09-07T12:00:00Z')
  const actionStore=versionedBlobStore(),sharedStore=versionedBlobStore()
  const repository=createAssistantActionRepository({store:actionStore,householdId:'house',now:()=>instant})
  const original={
    'bank-1':{id:'bank-1',name:'Amazon Prime',category:'GENERAL_MERCHANDISE'},
    'bank-2':{id:'bank-2',name:'Grocer',category:'Groceries'},
  }
  await sharedStore.setJSON('lslj-family/records/lslj_tx_overrides_v1',{
    key:'lslj_tx_overrides_v1',value:JSON.stringify(original),hash:'seed',version:3,
    updatedAt:'2026-09-07T11:00:00Z',updatedBy:'Larry',
  })
  const resources=createProductionActionResources({sharedStore,planStore:sharedStore,now:()=>instant})
  const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin')
  const proposal=await prepareDirectProposal({
    input:{
      summary:'Correct AT&T metadata',expectedVersion:3,
      operation:{type:'transaction.update',targetId:'bank-1',description:'Review the bank transaction name and category',payload:{name:'AT&T Wireless',category:'Phone'}},
    },
    session,permissions,repository,resources,now:instant,id:'transaction-proposal',
  })
  assert.deepEqual(proposal.expectedVersions,{'shared:lslj_tx_overrides_v1':3})

  const completed=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},leaseMs:0,now:()=>instant})
  const current=await resources.read('shared:lslj_tx_overrides_v1')
  assert.equal(current.version,4)
  assert.deepEqual(current.value['bank-1'],{id:'bank-1',name:'AT&T Wireless',category:'Phone'})
  assert.deepEqual(current.value['bank-2'],original['bank-2'])
  assert.equal('amount' in current.value['bank-1'],false)
  assert.equal((await repository.history()).filter(item=>item.id===completed.audit.id).length,1)
  const immutableAudit=await repository.getAudit(completed.audit.id)
  assert.deepEqual(immutableAudit.changes[0].before,original)
  assert.deepEqual(immutableAudit.changes[0].after,current.value)
  assert.equal(immutableAudit.undoAvailable,true)

  const undone=await undoActionWithJournal({repository,auditId:completed.audit.id,session,resources,event:{},leaseMs:0,now:()=>instant})
  assert.equal(undone.audit.action,'undo')
  const restored=await resources.read('shared:lslj_tx_overrides_v1')
  assert.equal(restored.version,5)
  assert.deepEqual(restored.value,original)
  assert.equal((await repository.getAudit(completed.audit.id)).undoAvailable,false)

  await assert.rejects(()=>prepareDirectProposal({
    input:{summary:'Stale correction',expectedVersion:3,operation:{type:'transaction.update',targetId:'bank-1',description:'Stale update',payload:{name:'Stale'}}},
    session,permissions,repository,resources,now:instant,id:'stale-transaction-proposal',
  }),error=>error.code==='VERSION_CONFLICT')
})

test('direct Action Mode review accepts a historical transaction categorization rule',async()=>{
  const instant=new Date('2026-09-09T13:00:00Z')
  const actionStore=versionedBlobStore(),sharedStore=versionedBlobStore()
  const repository=createAssistantActionRepository({store:actionStore,householdId:'house',now:()=>instant})
  await sharedStore.setJSON('lslj-family/records/lslj_tx_rules_v1',{
    key:'lslj_tx_rules_v1',value:'[]',hash:'seed',version:2,
    updatedAt:'2026-09-09T12:00:00Z',updatedBy:'Larry',
  })
  const resources=createProductionActionResources({sharedStore,planStore:sharedStore,now:()=>instant})
  const proposal=await prepareDirectProposal({
    input:{
      summary:'Categorize past and future Prosper Marketplace transactions',expectedVersion:2,
      operation:{type:'transaction.rule.create',description:'Apply Prosper Loan Payment to matching posted transactions',payload:{title:'Prosper loan',matchText:'PROSPER MARKETPL',matchField:'originalStatement',matchMode:'contains',category:'Prosper Loan Payment',accountId:'operating',applyToExisting:true,createdDate:'2026-09-09'}},
    },
    session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources,now:instant,id:'transaction-rule-proposal',
  })
  assert.equal(proposal.id,'transaction-rule-proposal')
  assert.equal(proposal.risk,'strong-confirmation')
  assert.deepEqual(proposal.expectedVersions,{'shared:lslj_tx_rules_v1':2})
})

test('member Undo stops before journal claim when the current domain permission was revoked',async()=>{
  const instant=new Date('2026-09-07T12:00:00Z'),store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>instant})
  const permissions=normalizePermissionMatrix()
  permissions.Nyla={...permissions.Nyla,planning:false}
  await repository.savePermissions(permissions,'Larry',0,'revoke-planning')
  const operation=normalizeActionProposal({summary:'Complete decision',operations:[{type:'decision.update',targetId:'decision-1',targetDate:'2026-09-07',description:'Complete decision',payload:{status:'complete'}}]},{member:'Nyla',role:'member',now:instant,id:'member-proposal'}).operations[0]
  const before={date:'2026-09-07',decisions:[{id:'decision-1',title:'Choose',owner:'Nyla',status:'needs-decision'}],assignments:[]}
  const after={...before,decisions:[{...before.decisions[0],status:'complete'}]}
  const audit=await repository.addAudit({id:'member-audit-revoked',proposalId:'member-proposal',summary:'Complete decision',actor:'Nyla',actorRole:'member',action:'execute',status:'completed',operations:[operation],changes:[{resource:'plan:2026-09-07',before,after,beforeVersion:3,afterVersion:4}],undoAvailable:true})
  let writes=0
  const resources={read:async()=>({value:structuredClone(after),version:4}),write:async()=>{writes+=1;throw new Error('must not write')}}
  await assert.rejects(()=>undoActionWithJournal({repository,auditId:audit.id,session:{member:'Nyla',role:'member'},resources,event:{},leaseMs:0,now:()=>instant}),error=>error.code==='FORBIDDEN'&&/planning actions are not enabled/.test(error.message))
  assert.equal(writes,0)
  assert.equal([...store.values.keys()].some(key=>key.includes('/journals/undo-')),false)
})

test('an in-progress member Undo rechecks revoked permission before recovery can claim or write again',async()=>{
  const instant=new Date('2026-09-07T12:00:00Z'),store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>instant})
  const operation=normalizeActionProposal({summary:'Complete decision',operations:[{type:'decision.update',targetId:'decision-1',targetDate:'2026-09-07',description:'Complete decision',payload:{status:'complete'}}]},{member:'Nyla',role:'member',now:instant,id:'recovery-proposal'}).operations[0]
  const before={date:'2026-09-07',decisions:[{id:'decision-1',title:'Choose',owner:'Nyla',status:'needs-decision'}],assignments:[]}
  const after={...before,decisions:[{...before.decisions[0],status:'complete'}]}
  const audit=await repository.addAudit({id:'member-audit-recovery',proposalId:'recovery-proposal',summary:'Complete decision',actor:'Nyla',actorRole:'member',action:'execute',status:'completed',operations:[operation],changes:[{resource:'plan:2026-09-07',before,after,beforeVersion:3,afterVersion:4}],undoAvailable:true})
  let writes=0
  const resources={read:async()=>({value:structuredClone(after),version:4}),write:async()=>{writes+=1;throw new Error('write stopped before commit')}}
  const input={repository,auditId:audit.id,session:{member:'Nyla',role:'member'},resources,event:{},leaseMs:0,now:()=>instant,createAttemptId:()=>`attempt-${writes+1}`}
  await assert.rejects(()=>undoActionWithJournal(input),/write stopped before commit/)
  const journalKey=[...store.values.keys()].find(key=>key.includes('/journals/undo-'))
  assert.ok(journalKey)
  const firstJournal=structuredClone(store.values.get(journalKey).data)
  assert.equal(firstJournal.state,'mutating')
  const permissions=normalizePermissionMatrix()
  permissions.Nyla={...permissions.Nyla,planning:false}
  await repository.savePermissions(permissions,'Larry',0,'revoke-during-undo')

  await assert.rejects(()=>undoActionWithJournal(input),error=>error.code==='FORBIDDEN'&&/planning actions are not enabled/.test(error.message))
  assert.equal(writes,1)
  assert.deepEqual(store.values.get(journalKey).data,firstJournal)
})

test('member Undo rechecks current ownership before creating or claiming its journal',async()=>{
  const instant=new Date('2026-09-07T12:00:00Z'),store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>instant})
  const operation=normalizeActionProposal({summary:'Complete decision',operations:[{type:'decision.update',targetId:'decision-1',targetDate:'2026-09-07',description:'Complete decision',payload:{status:'complete'}}]},{member:'Nyla',role:'member',now:instant,id:'ownership-proposal'}).operations[0]
  const before={date:'2026-09-07',decisions:[{id:'decision-1',title:'Choose',owner:'Nyla',status:'needs-decision'}],assignments:[]}
  const after={...before,decisions:[{...before.decisions[0],status:'complete'}]}
  const audit=await repository.addAudit({id:'member-audit-owner-changed',proposalId:'ownership-proposal',summary:'Complete decision',actor:'Nyla',actorRole:'member',action:'execute',status:'completed',operations:[operation],changes:[{resource:'plan:2026-09-07',before,after,beforeVersion:3,afterVersion:4}],undoAvailable:true})
  const newer={...after,decisions:[{...after.decisions[0],owner:'Lorenzo'}]}
  let writes=0
  const resources={read:async()=>({value:structuredClone(newer),version:5}),write:async()=>{writes+=1;throw new Error('must not write')}}
  await assert.rejects(()=>undoActionWithJournal({repository,auditId:audit.id,session:{member:'Nyla',role:'member'},resources,event:{},leaseMs:0,now:()=>instant}),error=>error.code==='FORBIDDEN'&&/can update only records/.test(error.message))
  assert.equal(writes,0)
  assert.equal([...store.values.keys()].some(key=>key.includes('/journals/undo-')),false)
})

test('a still-authorized member can Undo their unchanged owned record with full audit finalization',async()=>{
  const instant=new Date('2026-09-07T12:00:00Z'),store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>instant})
  const operation=normalizeActionProposal({summary:'Complete decision',operations:[{type:'decision.update',targetId:'decision-1',targetDate:'2026-09-07',description:'Complete decision',payload:{status:'complete'}}]},{member:'Nyla',role:'member',now:instant,id:'authorized-proposal'}).operations[0]
  const before={date:'2026-09-07',decisions:[{id:'decision-1',title:'Choose',owner:'Nyla',status:'needs-decision'}],assignments:[]}
  const after={...before,decisions:[{...before.decisions[0],status:'complete'}]}
  const audit=await repository.addAudit({id:'member-audit-authorized',proposalId:'authorized-proposal',summary:'Complete decision',actor:'Nyla',actorRole:'member',action:'execute',status:'completed',operations:[operation],changes:[{resource:'plan:2026-09-07',before,after,beforeVersion:3,afterVersion:4}],undoAvailable:true})
  let value=structuredClone(after),version=4,writes=0
  const resources={
    read:async()=>({value:structuredClone(value),version}),
    write:async(_resource,next,expected,actor,mutationId)=>{assert.equal(expected,4);writes+=1;version=5;value={...structuredClone(next),version,updatedBy:actor,lastActionId:mutationId};return{value:structuredClone(value),version}},
  }
  const result=await undoActionWithJournal({repository,auditId:audit.id,session:{member:'Nyla',role:'member'},resources,event:{},leaseMs:0,now:()=>instant})
  assert.equal(writes,1)
  assert.equal(value.decisions[0].status,'needs-decision')
  assert.equal(result.audit.action,'undo')
  assert.equal((await repository.getAudit(audit.id)).undoAvailable,false)
})

test('proposal repository persists proposals, permissions, an indexed history, and an immutable audit record',async()=>{
  const values=new Map(),store={get:async key=>values.get(key)||null,setJSON:async(key,value)=>values.set(key,structuredClone(value))}
  let sequence=0
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-05T12:00:00Z'),createId:()=>`audit-${++sequence}`})
  await repository.saveProposal({id:'p1',state:'pending'});assert.equal((await repository.getProposal('p1')).state,'pending')
  assert.equal((await repository.getProposalEntry('p1')).proposal.state,'pending')
  const permissions=await repository.savePermissions({Nyla:{projects:false}},'Larry',0);assert.equal(permissions.Nyla.projects,false)
  const audit=await repository.addAudit({summary:'Updated',actor:'Larry'});assert.equal(audit.id,'audit-1');assert.equal((await repository.history()).length,1)
  assert.equal(values.get('house/audits/audit-1').summary,'Updated')
})

test('proposal claiming is atomic and an existing proposal without an ETag cannot be claimed',async()=>{
  const store=versionedBlobStore(),repository=createAssistantActionRepository({store,householdId:'house'})
  await repository.saveProposal({id:'proposal-claim',state:'pending'})
  const entry=await repository.getProposalEntry('proposal-claim')
  const claims=await Promise.all([
    repository.saveProposalState({...entry.proposal,state:'executing',startedBy:'Larry'},{onlyIfMatch:entry.etag}),
    repository.saveProposalState({...entry.proposal,state:'executing',startedBy:'Nyla'},{onlyIfMatch:entry.etag}),
  ])
  assert.equal(claims.filter(claim=>claim.modified).length,1)
  assert.equal(['Larry','Nyla'].includes((await repository.getProposal('proposal-claim')).startedBy),true)

  const key='house/proposals/proposal-claim',preserved=structuredClone(store.values.get(key).data)
  store.values.get(key).etag=null
  await assert.rejects(()=>repository.saveProposalState({...preserved,state:'failed'},{onlyIfMatch:null}),error=>error.code==='JOURNAL_CONFLICT')
  assert.deepEqual(store.values.get(key).data,preserved)
})

test('journal claims use CAS, reject a second claimant, and never advance without an ETag',async()=>{
  const store=versionedBlobStore(),repository=createAssistantActionRepository({store,householdId:'house'})
  await repository.ensureJournal({id:'journal-claim',kind:'execute',subjectId:'proposal-1',actor:'Larry',requestHash:'request-1',state:'prepared'})
  const claim=attempt=>repository.updateJournal('journal-claim',current=>{
    if(current.state!=='prepared')throw Object.assign(new Error('already claimed'),{code:'ACTION_IN_PROGRESS'})
    return{...current,state:'mutating',mutationAttempt:attempt}
  })
  const results=await Promise.allSettled([claim('attempt-a'),claim('attempt-b')])
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
  assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='ACTION_IN_PROGRESS').length,1)
  const claimed=(await repository.getJournalEntry('journal-claim')).journal
  assert.equal(claimed.state,'mutating')
  assert.equal(['attempt-a','attempt-b'].includes(claimed.mutationAttempt),true)

  const key='house/journals/journal-claim',preserved=structuredClone(store.values.get(key).data)
  store.values.get(key).etag=null
  await assert.rejects(()=>repository.updateJournal('journal-claim',current=>({...current,state:'mutated'})),error=>error.code==='JOURNAL_CONFLICT')
  await assert.rejects(()=>repository.saveJournalState({...preserved,state:'mutated'},{onlyIfMatch:null}),error=>error.code==='JOURNAL_CONFLICT')
  assert.deepEqual(store.values.get(key).data,preserved)
})

test('a live execution journal lease rejects a second executor before any duplicate domain write',async()=>{
  const instant=new Date('2026-09-07T12:00:00Z'),store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>instant})
  const proposal=normalizeActionProposal({summary:'Complete decision',operations:[{type:'decision.update',targetId:'decision-1',targetDate:'2026-09-07',description:'Complete decision',payload:{status:'complete'}}]},{member:'Larry',role:'admin',now:instant,id:'leased-execution'})
  proposal.expectedVersions={'plan:2026-09-07':3}
  let value={date:'2026-09-07',decisions:[{id:'decision-1',title:'Choose',owner:'Larry',status:'needs-decision'}],assignments:[]},version=3,writes=0
  let signalWriteStarted,releaseWrite
  const writeStarted=new Promise(resolve=>{signalWriteStarted=resolve})
  const writeGate=new Promise(resolve=>{releaseWrite=resolve})
  const resources={
    read:async()=>({value:structuredClone(value),version}),
    write:async(_resource,next,expected,actor,mutationId)=>{
      assert.equal(expected,3);writes+=1;signalWriteStarted();await writeGate
      version=4;value={...structuredClone(next),version,updatedBy:actor,lastActionId:mutationId}
      return{value:structuredClone(value),version}
    },
  }
  let attempts=0
  const input={repository,proposal,operations:proposal.operations,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:60_000,now:()=>instant,createAttemptId:()=>`attempt-${++attempts}`}
  const first=executeActionWithJournal(input)
  await writeStarted
  await assert.rejects(()=>executeActionWithJournal(input),error=>error.code==='ACTION_IN_PROGRESS')
  assert.equal(writes,1)
  releaseWrite()
  const completed=await first
  assert.equal(completed.audit.action,'execute')
  assert.equal(value.decisions[0].status,'complete')
  assert.equal(writes,1)
})

test('an existing audit history index without an ETag is never overwritten unconditionally',async()=>{
  const store=versionedBlobStore(),repository=createAssistantActionRepository({store,householdId:'house'})
  const existing=[{id:'existing-audit',summary:'Preserve me'}]
  store.values.set('house/history',{data:structuredClone(existing),etag:null})
  await assert.rejects(()=>repository.addAudit({id:'new-audit',summary:'New',actor:'Larry'}),error=>error.code==='JOURNAL_CONFLICT')
  assert.deepEqual(store.values.get('house/history').data,existing)
  assert.equal(store.values.has('house/audits/new-audit'),true)
})

test('visible audit index stays lightweight while immutable detail retains full recovery images',async()=>{
  const store=versionedBlobStore(),repository=createAssistantActionRepository({store,householdId:'house'})
  await repository.addAudit({id:'audit-detail',summary:'Changed a record',actor:'Larry',action:'execute',changes:[{resource:'shared:test',before:{large:'before'},after:{large:'after'},beforeVersion:1,afterVersion:2}],undoAvailable:true})
  const indexed=store.values.get('house/history').data[0]
  assert.equal('changes' in indexed,false)
  assert.deepEqual(indexed.affectedRecords,[{resource:'shared:test',beforeVersion:1,afterVersion:2}])
  assert.equal((await repository.getAudit('audit-detail')).changes[0].before.large,'before')
})

test('permission changes use CAS, durable audit recovery, and strict Undo',async()=>{
  const store=versionedBlobStore(),repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  const initial=await repository.savePermissions({Nyla:{planning:true,calendar:true,projects:true,finance:false}},'Larry',0)
  const desired={...normalizePermissionMatrix(initial),Nyla:{...normalizePermissionMatrix(initial).Nyla,projects:false}}
  const originalSave=repository.savePermissions.bind(repository);let loseResponse=true,writes=0
  repository.savePermissions=async(...args)=>{const saved=await originalSave(...args);writes+=1;if(loseResponse){loseResponse=false;throw new Error('permission response lost')}return saved}
  const input={repository,matrix:desired,session:{member:'Larry',role:'admin'},expectedVersion:1,leaseMs:0,now:()=>new Date('2026-09-07T12:01:00Z')}
  await assert.rejects(()=>savePermissionsWithJournal(input),/permission response lost/)
  const applied=await savePermissionsWithJournal(input)
  assert.equal(writes,1)
  assert.equal(applied.permissions.Nyla.projects,false)
  assert.equal(applied.permissionVersion,2)
  assert.equal(applied.audit.action,'permissions')
  assert.equal(applied.audit.undoAvailable,true)
  const resources=createPermissionActionResources(repository)
  const undone=await undoActionWithJournal({repository,auditId:applied.audit.id,session:{member:'Larry',role:'admin'},resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T12:02:00Z')})
  assert.equal(undone.audit.action,'undo')
  const restored=await repository.getPermissionsState()
  assert.equal(restored.permissions.Nyla.projects,true)
  assert.equal(restored.version,3)
  assert.equal((await repository.getAudit(applied.audit.id)).undoAvailable,false)
  await assert.rejects(()=>savePermissionsWithJournal({...input,matrix:{...desired,Nyla:{...desired.Nyla,calendar:false}}}),error=>error.code==='VERSION_CONFLICT')
})

test('direct calendar review stores a versioned Action Mode proposal and enforces ownership',async()=>{
  const events=[{id:'apple-1',uid:'apple-1',sourceId:'assistant-old',etag:'v3',title:'Dinner',owner:'Nyla',participants:[]}]
  let saved
  const repository={saveProposal:async proposal=>{saved=proposal;return proposal}}
  const input={summary:'Update Dinner',expectedEventToken:'v3',operation:{type:'calendar.update',description:'Update Dinner',targetId:'apple-1',targetDate:'2026-09-08',payload:{title:'Family dinner',date:'2026-09-08',owner:'Nyla'},allowedScopes:['this-item'],defaultScope:'this-item'}}
  const proposal=await prepareCalendarProposal({input,session:{member:'Nyla',role:'member'},permissions:defaultActionPermissions('member'),events,repository,now:new Date('2026-09-07T12:00:00Z'),id:'calendar-proposal'})
  assert.equal(saved.id,'calendar-proposal')
  assert.equal(saved.expectedCalendarVersion,calendarVersion(events))
  assert.equal(proposal.operations[0].payload.title,'Family dinner')

  await assert.rejects(()=>prepareCalendarProposal({...{input:{...input,expectedEventToken:'v2'},session:{member:'Nyla',role:'member'},permissions:defaultActionPermissions('member'),events,repository}}),error=>error.code==='VERSION_CONFLICT')
  await assert.rejects(()=>prepareCalendarProposal({input,session:{member:'Lorenzo',role:'member'},permissions:defaultActionPermissions('member'),events,repository}),error=>error.code==='FORBIDDEN')
})

test('direct calendar review allows safe creation but rejects edits to native Apple records',async()=>{
  const repository={saveProposal:async proposal=>proposal}
  const createInput={summary:'Create appointment',operation:{type:'calendar.create',description:'Create appointment',targetId:'',targetDate:'2026-09-09',payload:{title:'Appointment',date:'2026-09-09',owner:'Larry'},allowedScopes:['this-item'],defaultScope:'this-item'}}
  const created=await prepareCalendarProposal({input:createInput,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),events:[],repository,now:new Date('2026-09-07T12:00:00Z'),id:'create-calendar'})
  assert.equal(created.operations[0].type,'calendar.create')

  const planInput={summary:'Create plan appointment',operation:{...createInput.operation,targetId:'daily-2026-09-09-finance-review',payload:{title:'Family Finance Meeting',date:'2026-09-09',time:'09:00',allDay:false,owner:'Family',participants:[],notes:'',priority:'normal'}}}
  const planProposal=await prepareCalendarProposal({input:planInput,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),events:[],repository,now:new Date('2026-09-07T12:00:00Z'),id:'plan-calendar'})
  assert.equal(planProposal.operations[0].targetId,'daily-2026-09-09-finance-review')
  const alreadyCurrent={id:'calendar-1',sourceId:'assistant-daily-2026-09-09-finance-review',title:'Family Finance Meeting',date:'2026-09-09',time:'09:00',allDay:false,pillar:'household',owner:'Family',participants:[],notes:'',priority:false}
  assert.equal(await prepareCalendarProposal({input:planInput,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),events:[alreadyCurrent],repository,now:new Date('2026-09-07T12:00:00Z'),id:'plan-calendar-retry'}),null)

  const native=[{id:'native-1',sourceId:'native-1',etag:'native-v1',title:'Native',owner:'Family'}]
  const updateInput={summary:'Update native',expectedEventToken:'native-v1',operation:{...createInput.operation,type:'calendar.update',targetId:'native-1'}}
  await assert.rejects(()=>prepareCalendarProposal({input:updateInput,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),events:native,repository}),error=>error.code==='FORBIDDEN')
})

test('calendar Undo stops before writing when the Apple event has a newer version',async()=>{
  const calls=[]
  const after={id:'event-1',uid:'event-1',sourceId:'assistant-op',href:'/event-1.ics',etag:'saved-v2',title:'Updated'}
  const audit={actor:'Larry',undoAvailable:true,changes:[{resource:'calendar:apple-family',before:{...after,etag:'old-v1',title:'Original'},after}]}
  const calendarRequestFn=async(_event,method,body)=>{
    calls.push({method,body})
    if(method==='GET')return{events:[{...after,etag:'newer-v3'}]}
    throw new Error('Undo must not write after a conflict')
  }
  await assert.rejects(()=>undoAudit({event:{},audit,session:{member:'Larry',role:'admin'},resources:{},calendarRequestFn}),error=>error.code==='VERSION_CONFLICT')
  assert.deepEqual(calls.map(call=>call.method),['GET'])
})

test('calendar Undo restores an update with the current Apple etag',async()=>{
  const calls=[]
  const before={id:'event-1',uid:'event-1',sourceId:'assistant-op',href:'/event-1.ics',etag:'old-v1',title:'Original'}
  const after={...before,etag:'saved-v2',title:'Updated'}
  const audit={actor:'Larry',undoAvailable:true,changes:[{resource:'calendar:apple-family',before,after}]}
  const calendarRequestFn=async(_event,method,body)=>{
    calls.push({method,body})
    if(method==='GET')return{events:[after]}
    return{ok:true}
  }
  const restored=await undoAudit({event:{},audit,session:{member:'Larry',role:'admin'},resources:{},calendarRequestFn})
  assert.deepEqual(restored,['calendar:apple-family'])
  assert.deepEqual(calls.map(call=>call.method),['GET','PUT'])
  assert.equal(calls[1].body.title,'Original')
  assert.equal(calls[1].body.etag,'saved-v2')
})

test('calendar delete Undo requests identity-preserving restoration',async()=>{
  const calls=[]
  const before={id:'event-1',uid:'event-1',sourceId:'assistant-op',href:'/event-1.ics',etag:'old-v1',title:'Original'}
  const audit={actor:'Larry',undoAvailable:true,changes:[{resource:'calendar:apple-family',before,after:null}]}
  const calendarRequestFn=async(_event,method,body)=>{calls.push({method,body});if(method==='GET')return{events:[]};return{ok:true}}
  await undoAudit({event:{},audit,session:{member:'Larry',role:'admin'},resources:{},calendarRequestFn})
  assert.deepEqual(calls.map(call=>call.method),['GET','POST'])
  assert.equal(calls[1].body._restoreDeleted,true)
  assert.equal(calls[1].body.uid,'event-1')
  assert.equal(calls[1].body.href,'/event-1.ics')
})

test('immutable audits remain addressable after the visible history reaches its 100-record limit',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  await repository.addAudit({id:'oldest',journalId:'execute-oldest',proposalId:'p-oldest',summary:'Oldest',actor:'Larry',action:'execute',undoAvailable:true})
  for(let index=0;index<101;index+=1){
    await repository.addAudit({id:`new-${index}`,journalId:`execute-new-${index}`,proposalId:`p-${index}`,summary:`New ${index}`,actor:'Larry',action:'execute',undoAvailable:true})
  }
  assert.equal((await repository.history()).some(item=>item.id==='oldest'),false)
  assert.equal((await repository.getAudit('oldest')).summary,'Oldest')
  const undone=await undoActionWithJournal({repository,auditId:'oldest',session:{member:'Larry',role:'admin'},resources:{},event:{},leaseMs:0})
  assert.equal(undone.audit.action,'undo')
  assert.equal((await repository.getAudit('oldest')).undoAvailable,false)
})

test('history CAS exhaustion is visible and an idempotent retry repairs the index without duplicating the audit',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  const record={id:'audit-repair',journalId:'execute-repair',proposalId:'proposal-repair',completionHash:'repair-hash',summary:'Repair me',actor:'Larry',action:'execute',undoAvailable:true}
  store.failNextHistoryWrites(5)
  await assert.rejects(()=>repository.addAudit(record,{idempotent:true}),error=>error.code==='JOURNAL_CONFLICT')
  assert.equal((await repository.getAudit(record.id)).summary,'Repair me')
  await repository.addAudit(record,{idempotent:true})
  assert.deepEqual((await repository.history()).map(item=>item.id),['audit-repair'])
})

test('an idempotent history repair preserves the immutable Undo status marker',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  const record={id:'audit-undone',journalId:'execute-undone',proposalId:'proposal-undone',completionHash:'undone-hash',summary:'Already undone',actor:'Larry',action:'execute',undoAvailable:true}
  await repository.addAudit(record,{idempotent:true})
  await repository.markAuditUndone(record.id,{undoneAt:'2026-09-07T12:01:00Z',undoneBy:'Larry',undoAuditId:'audit-undo-undone'})
  await repository.addAudit(record,{idempotent:true})
  const visible=(await repository.history()).find(item=>item.id===record.id)
  assert.equal(visible.undoAvailable,false)
  assert.equal(visible.undoAuditId,'audit-undo-undone')
})

test('visible history hydrates immutable Undo status even if its index copy is stale',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  const record={id:'audit-raced',journalId:'execute-raced',proposalId:'proposal-raced',completionHash:'raced-hash',summary:'Raced status',actor:'Larry',action:'execute',undoAvailable:true}
  await repository.addAudit(record,{idempotent:true})
  await repository.markAuditUndone(record.id,{undoneAt:'2026-09-07T12:01:00Z',undoneBy:'Larry',undoAuditId:'audit-undo-raced'})
  await store.setJSON('house/history',[record])
  const visible=(await repository.history())[0]
  assert.equal(visible.undoAvailable,false)
  assert.equal(visible.undoAuditId,'audit-undo-raced')
})

test('legacy history-only audits are backfilled immutably and remain Undoable after release migration',async()=>{
  const store=versionedBlobStore()
  const before={date:'2026-09-07',decisions:[{id:'d1',title:'Choose',owner:'Larry',status:'needs-decision'}],assignments:[]}
  const after={...before,decisions:[{...before.decisions[0],status:'complete'}]}
  const legacy={id:'legacy-only',proposalId:'legacy-proposal',summary:'Legacy decision',actor:'Larry',action:'execute',status:'completed',occurredAt:'2026-09-07T11:00:00Z',operations:[],changes:[{resource:'plan:2026-09-07',before,after,beforeVersion:3,afterVersion:4}],undoAvailable:true}
  await store.setJSON('house/history',[legacy])
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  let value={...after,version:4,updatedBy:'Ask Brevity · Larry',lastActionId:'legacy-write'},version=4,writes=0
  const resources={
    read:async()=>({value:structuredClone(value),version}),
    write:async(_resource,next,expected,actor,mutationId)=>{assert.equal(expected,version);writes+=1;version+=1;value={...structuredClone(next),version,updatedBy:actor,lastActionId:mutationId};return{value:structuredClone(value),version}},
  }
  const restored=await undoActionWithJournal({repository,auditId:legacy.id,session:{member:'Larry',role:'admin'},resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T12:00:00Z')})
  assert.equal(writes,1)
  assert.equal(restored.audit.action,'undo')
  assert.equal(store.values.has('house/audits/legacy-only'),true)
  assert.equal((await repository.getAudit(legacy.id)).undoAvailable,false)
})

test('Blob read failures propagate instead of becoming empty Action Mode state',async()=>{
  const unavailable={
    get:async()=>{throw Object.assign(new Error('storage unavailable'),{status:503})},
    getWithMetadata:async()=>{throw Object.assign(new Error('storage unavailable'),{status:503})},
    setJSON:async()=>{throw new Error('must not write')},
  }
  const repository=createAssistantActionRepository({store:unavailable,householdId:'house'})
  await assert.rejects(()=>repository.history(),/storage unavailable/)
  await assert.rejects(()=>repository.getAudit('missing'),/storage unavailable/)
})

test('execute journal recovers a committed record write after an uncertain response and creates one audit',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  let value={date:'2026-09-07',decisions:[{id:'d1',title:'Choose',owner:'Larry',status:'needs-decision'}],assignments:[]},version=3,lastActionId='',writes=0,failAfterWrite=true
  const resources={
    read:async()=>({value:structuredClone(value),version}),
    write:async(_resource,next,expected,actor,mutationId)=>{
      assert.equal(expected,version)
      writes+=1;version+=1;lastActionId=mutationId
      value={...structuredClone(next),version,updatedBy:actor,lastActionId}
      if(failAfterWrite){failAfterWrite=false;throw new Error('connection ended after commit')}
      return{value:structuredClone(value),version}
    },
  }
  resources.read=async()=>({value:structuredClone(value),version})
  const operation={id:'o1',type:'decision.update',domain:'planning',description:'Complete decision',targetId:'d1',targetDate:'2026-09-07',payload:{status:'complete'},allowedScopes:['this-item'],defaultScope:'this-item',selectedScope:'this-item',risk:'confirmation'}
  const proposal={id:'proposal-record',summary:'Complete decision',expectedVersions:{'plan:2026-09-07':3},operations:[operation]}
  const input={repository,proposal,operations:[operation],session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T12:00:00Z')}
  await assert.rejects(()=>executeActionWithJournal(input),/connection ended after commit/)
  const recovered=await executeActionWithJournal(input)
  const repeated=await executeActionWithJournal(input)
  assert.equal(writes,1)
  assert.equal(recovered.audit.id,repeated.audit.id)
  assert.equal((await repository.history()).filter(item=>item.id===recovered.audit.id).length,1)
  assert.equal(recovered.audit.changes[0].before.decisions[0].status,'needs-decision')
  assert.equal(recovered.audit.changes[0].after.decisions[0].status,'complete')
})

test('execute journal preserves the reviewed this-and-future recurrence scope',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  let value={transactions:[{id:'r1',name:'Phone',amount:400,type:'expense',freq:'monthly',start:'2026-09-01',end:'',skips:[]}]},version=4,record={updatedBy:'',lastActionId:''}
  const resources={
    read:async()=>({value:structuredClone(value),version,record}),
    write:async(_resource,next,expected,actor,mutationId)=>{assert.equal(expected,version);version+=1;value=structuredClone(next);record={updatedBy:actor,lastActionId:mutationId};return{value:structuredClone(value),version}},
  }
  const operation={id:'future-phone',type:'recurring.update',domain:'finance',description:'Update future phone expense',targetId:'r1',targetDate:'2026-10-01',payload:{amount:450},allowedScopes:['this-item','this-and-future'],defaultScope:'this-item',selectedScope:'this-and-future',risk:'strong-confirmation'}
  const proposal={id:'proposal-future',summary:'Update phone expense',expectedVersions:{'shared:lslj_finance_v9':4},operations:[operation]}
  const result=await executeActionWithJournal({repository,proposal,operations:[operation],session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0})
  assert.equal(result.journal.operations[0].selectedScope,'this-and-future')
  assert.equal(result.audit.operations[0].selectedScope,'this-and-future')
})

test('execute journal recovers a calendar create that succeeded before the response failed',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  let events=[],posts=0,failAfterPost=true
  const calendarRequestFn=async(_event,method,body)=>{
    if(method==='GET')return{events:structuredClone(events)}
    if(method==='POST'){
      posts+=1
      const created={...body,id:'apple-1',uid:'apple-1',href:'/apple-1.ics',etag:'etag-1'}
      events=[created]
      if(failAfterPost){failAfterPost=false;throw new Error('calendar response lost')}
      return created
    }
    throw new Error(`Unexpected ${method}`)
  }
  const operation={id:'calendar-op',type:'calendar.create',domain:'calendar',description:'Create dinner',targetId:'',targetDate:'2026-09-08',payload:{title:'Dinner',date:'2026-09-08',owner:'Larry'},allowedScopes:['this-item'],defaultScope:'this-item',selectedScope:'this-item',risk:'confirmation'}
  const proposal={id:'proposal-calendar',summary:'Create dinner',expectedCalendarVersion:calendarVersion([]),operations:[operation]}
  const input={repository,proposal,operations:[operation],session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources:{},event:{},calendarRequestFn,leaseMs:0,now:()=>new Date('2026-09-07T12:00:00Z')}
  await assert.rejects(()=>executeActionWithJournal(input),/calendar response lost/)
  const result=await executeActionWithJournal(input)
  assert.equal(posts,1)
  assert.equal(result.audit.changes[0].after.etag,'etag-1')
})

test('Calendar delete recovery fails closed when absence has no matching mutation receipt',async()=>{
  const before={id:'apple-1',uid:'apple-1',sourceId:'assistant-op',href:'/apple-1.ics',etag:'etag-1',title:'Dinner'}
  const prepared=[{resource:'calendar:apple-family',operationType:'calendar.delete',before,after:null}]
  const calendarRequestFn=async(_event,method)=>{
    if(method==='GET')return{events:[]}
    throw Object.assign(new Error('no matching deletion receipt'),{code:'VERSION_CONFLICT'})
  }
  await assert.rejects(()=>commitPreparedCalendarOperations({event:{},prepared,calendarRequestFn,mutationId:'execute-calendar-delete'}),error=>error.code==='VERSION_CONFLICT')
})

test('Calendar delete retries validate a durable receipt and never delete twice',async()=>{
  const before={id:'apple-1',uid:'apple-1',sourceId:'assistant-op',href:'/apple-1.ics',etag:'etag-1',title:'Dinner'}
  const prepared=[{resource:'calendar:apple-family',operationType:'calendar.delete',before,after:null}]
  let events=[before],deletes=0,receipt=null,loseResponse=true
  const calendarRequestFn=async(_event,method,body)=>{
    if(method==='GET')return{events:structuredClone(events)}
    if(method==='DELETE'){
      if(events.length){
        deletes+=1;events=[];receipt={actionId:body.actionId,href:body.href,etag:body.etag}
        if(loseResponse){loseResponse=false;throw new Error('calendar delete response lost')}
        return{ok:true}
      }
      if(receipt?.actionId===body.actionId&&receipt.href===body.href&&receipt.etag===body.etag)return{ok:true,recovered:true}
      throw Object.assign(new Error('no matching deletion receipt'),{code:'VERSION_CONFLICT'})
    }
    throw new Error(`Unexpected ${method}`)
  }
  const input={event:{},prepared,calendarRequestFn,mutationId:'execute-calendar-delete'}
  await assert.rejects(()=>commitPreparedCalendarOperations(input),/response lost/)
  const recovered=await commitPreparedCalendarOperations(input)
  assert.equal(deletes,1)
  assert.equal(recovered[0].after,null)
})

test('Calendar deletion receipts are immutable and collision checked',async()=>{
  const repository=createAssistantActionRepository({store:versionedBlobStore(),householdId:'house'})
  const receipt={id:'execute-calendar-delete',kind:'delete',href:'/apple-1.ics',reviewedEtag:'etag-1'}
  await repository.saveCalendarMutationReceipt(receipt)
  await repository.saveCalendarMutationReceipt(receipt)
  assert.deepEqual(await repository.getCalendarMutationReceipt(receipt.id),receipt)
  await assert.rejects(()=>repository.saveCalendarMutationReceipt({...receipt,href:'/other.ics'}),error=>error.code==='JOURNAL_CONFLICT')
})

test('Undo journal recovers a completed restoration and finalizes immutable status without writing twice',async()=>{
  const store=versionedBlobStore()
  const writeBlob=store.setJSON.bind(store)
  store.setJSON=async(key,value,options)=>{
    const result=await writeBlob(key,value,options)
    if(key.includes('/audit-status/')&&result.modified)store.failNextHistoryWrites(5)
    return result
  }
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  const before={date:'2026-09-07',decisions:[{id:'d1',title:'Choose',owner:'Larry',status:'needs-decision'}],assignments:[]}
  const after={...before,decisions:[{...before.decisions[0],status:'complete'}]}
  const original=await repository.addAudit({id:'original-audit',journalId:'execute-original',proposalId:'proposal-original',summary:'Complete decision',actor:'Larry',action:'execute',status:'completed',operations:[],changes:[{resource:'plan:2026-09-07',before,after,beforeVersion:3,afterVersion:4}],undoAvailable:true})
  let value={...after,version:4,updatedBy:'Ask Brevity · Larry',lastActionId:'execute-original'},version=4,writes=0,failAfterWrite=true
  const resources={
    read:async()=>({value:structuredClone(value),version}),
    write:async(_resource,next,expected,actor,mutationId)=>{
      assert.equal(expected,version);writes+=1;version+=1
      value={...structuredClone(next),version,updatedBy:actor,lastActionId:mutationId}
      if(failAfterWrite){failAfterWrite=false;throw new Error('undo response lost')}
      return{value:structuredClone(value),version}
    },
  }
  const input={repository,auditId:original.id,session:{member:'Larry',role:'admin'},resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T12:00:00Z')}
  await assert.rejects(()=>undoActionWithJournal(input),/undo response lost/)
  await assert.rejects(()=>undoActionWithJournal(input),error=>error.code==='JOURNAL_CONFLICT')
  const recovered=await undoActionWithJournal(input)
  const repeated=await undoActionWithJournal(input)
  const updatedOriginal=await repository.getAudit(original.id)
  assert.equal(writes,1)
  assert.equal(recovered.audit.id,repeated.audit.id)
  assert.equal(updatedOriginal.undoAvailable,false)
  assert.equal(updatedOriginal.undoAuditId,recovered.audit.id)
  assert.equal((await repository.history()).filter(item=>item.id===recovered.audit.id).length,1)
})

test('Undo recovery finishes only pending changes after a partially completed legacy Undo',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'house',now:()=>new Date('2026-09-07T12:00:00Z')})
  const changes=[
    {resource:'shared:one',before:{value:'one-before'},after:{value:'one-after'},beforeVersion:1,afterVersion:2},
    {resource:'shared:two',before:{value:'two-before'},after:{value:'two-after'},beforeVersion:1,afterVersion:2},
  ]
  const original=await repository.addAudit({id:'legacy-multi',journalId:'execute-legacy',proposalId:'proposal-legacy',summary:'Legacy multi-resource action',actor:'Larry',action:'execute',status:'completed',operations:[],changes,undoAvailable:true})
  const state=new Map(changes.map(change=>[change.resource,{value:change.after,version:2,record:{updatedBy:'Ask Brevity · Larry',lastActionId:'execute-legacy'}}]))
  const writes=new Map();let failOne=true
  const resources={
    read:async resource=>structuredClone(state.get(resource)),
    write:async(resource,next,expected,actor,mutationId)=>{
      writes.set(resource,(writes.get(resource)||0)+1)
      if(resource==='shared:one'&&failOne){failOne=false;throw new Error('second restore did not start')}
      const current=state.get(resource);assert.equal(current.version,expected)
      const saved={value:structuredClone(next),version:expected+1,record:{updatedBy:actor,lastActionId:mutationId}}
      state.set(resource,saved);return{value:saved.value,version:saved.version}
    },
  }
  const input={repository,auditId:original.id,session:{member:'Larry',role:'admin'},resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T12:00:00Z')}
  await assert.rejects(()=>undoActionWithJournal(input),/second restore did not start/)
  const recovered=await undoActionWithJournal(input)
  assert.deepEqual(new Set(recovered.journal.restored),new Set(['shared:one','shared:two']))
  assert.equal(writes.get('shared:two'),1)
  assert.equal(state.get('shared:one').value.value,'one-before')
  assert.equal(state.get('shared:two').value.value,'two-before')
})

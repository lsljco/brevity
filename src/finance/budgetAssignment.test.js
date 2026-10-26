import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeActionProposal,defaultActionPermissions} from '../../netlify/lib/assistant-action-contract.mjs'
import {prepareRecordOperations,applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {prepareDirectProposal} from '../../netlify/functions/brevity-assistant-actions.mjs'
import {buildBudgetLines,allocateBudgetActuals} from './budgetBreakdown.js'
import {buildSpendingAccountability} from './spendingAccountability.js'
const account={id:'cash',name:'Checking',plaidAccountId:'bank',type:'checking',plaidType:'depository',plaidSubtype:'checking'}
const plan={id:'fuel',acct:'cash',name:'Gas / Fuel',cat:'Transportation',type:'expense',amount:150,freq:'monthly',start:'2026-10-01'}
const transaction={id:'charge',accountId:'bank',date:'2026-10-05',amount:40,pending:false,category:'GENERAL_MERCHANDISE',name:'Fuel fixture'}
const proposal=()=>({...normalizeActionProposal({operations:[{type:'transaction.allocate',targetId:'charge',payload:{budgetLineId:'cash:fuel',category:'Transportation'}}]},{member:'Larry',role:'admin'}),expectedVersions:{'shared:lslj_tx_overrides_v1':2}})
const prepare=async({bank=[transaction],finance={accounts:[account],transactions:[plan]},session={member:'Larry',role:'admin'},overrides={}}={})=>prepareRecordOperations({proposal:proposal(),session,permissions:defaultActionPermissions('admin'),resources:{read:async key=>({version:key==='shared:lslj_tx_overrides_v1'?2:1,value:key==='shared:plaid_actuals_cache'?bank:key==='shared:lslj_finance_v9'?finance:key==='shared:lslj_tx_overrides_v1'?overrides:{}})}})
test('reviewed budget assignment counts fuel once against its exact line and category',async()=>{
 const prepared=await prepare(),saved=prepared.prepared[0].after.charge
 const actual={...transaction,...saved},lines=buildBudgetLines([plan],{})
 assert.deepEqual(saved,{id:'charge',category:'Transportation',budgetLineId:'cash:fuel'})
 assert.equal(actual.amount,40)
 assert.deepEqual(allocateBudgetActuals([actual],lines,{bank:'cash'}),{byLine:{'cash:fuel':40},byCategory:{Transportation:40},unallocatedByCategory:{}})
 const model=buildSpendingAccountability({accounts:[account],scheduled:[plan],actuals:[actual,{...actual,id:'second',amount:120}],period:{from:'2026-10-01',to:'2026-10-31'}})
 assert.equal(model.rows[0].classification,'budgeted');assert.equal(model.rows[0].budget,150);assert.equal(model.rows[1].exceptionAmount,10)
 assert.deepEqual(model.totals,{unbudgeted:0,over:10,review:0})
 const changed=applyRecordOperation({charge:saved},{type:'transaction.categorize',targetId:'charge',payload:{category:'Food'}}).after.charge
 assert.equal(changed.budgetLineId,null)
})
test('budget assignment rejects pending, transfers, missing sources, wrong accounts and changed categories',async()=>{
 for(const bank of [[],[{...transaction,pending:true}],[{...transaction,category:'TRANSFER_OUT'}]])await assert.rejects(prepare({bank}),/existing posted non-transfer/)
 for(const finance of [{accounts:[account],transactions:[]},{accounts:[account],transactions:[{...plan,acct:'other'}]},{accounts:[account],transactions:[{...plan,cat:'Food'}]}])await assert.rejects(prepare({finance}),/budget line or account changed/)
 await assert.rejects(prepare({session:{member:'Javin',role:'member'}}),/permission|administrator|finance|allowed/i)
})

test('direct budget and category review reaches server validation and stores a proposal without changing bank records',async()=>{
 const saved=[]
 const resources={read:async key=>({version:key==='shared:lslj_tx_overrides_v1'?2:1,value:key==='shared:plaid_actuals_cache'?[transaction]:key==='shared:lslj_finance_v9'?{accounts:[account],transactions:[plan]}:{}})}
 for(const operation of [{type:'transaction.allocate',targetId:'charge',payload:{budgetLineId:'cash:fuel',category:'Transportation'}},{type:'transaction.categorize',targetId:'charge',payload:{category:'Transportation'}}]){
  const result=await prepareDirectProposal({input:{summary:'Assign fuel',operation,expectedVersion:2},session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,repository:{saveProposal:async proposal=>saved.push(proposal)}})
  assert.equal(result.operations[0].type,operation.type)
  assert.deepEqual(result.expectedVersions,{'shared:lslj_tx_overrides_v1':2})
 }
 assert.equal(saved.length,2)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { scopedClosingBalances } from './dailyClosingBalances.js'
import { buildOutstandingCashForecast } from './outstandingCashForecast.js'
import { restorePersistedFinanceData } from './financeData.js'
import { normalizeActionOperation, permissionForOperation } from '../../netlify/lib/assistant-action-contract.mjs'
import { applyRecordOperation, resourceForOperation } from '../../netlify/lib/assistant-action-executor.mjs'
const { validatePlaidFinanceUpdate } = createRequire(import.meta.url)('../../netlify/legacy-functions/household-state.js')
const accounts=[{id:'cash',name:'Cash',type:'checking',balance:900,plaidCurrentBalance:900,plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking'},{id:'save',name:'Savings',type:'savings',balance:100}]
const state={accounts,transactions:[]}
const context={actor:'Larry',now:()=>new Date('2026-10-25T20:00:00Z')}
const operation=(amount=0)=>normalizeActionOperation({type:'finance.close.set',targetId:'cash',targetDate:'2026-10-24',payload:{amount,notes:'Statement'}})

test('recorded closes accept zero and negatives without changing live balances or plans',()=>{
 for(const amount of [0,-45.50,1234.56]) {
  const op=operation(amount)
  assert.equal(resourceForOperation(op),'shared:lslj_finance_v9')
  const {after}=applyRecordOperation(state,op,undefined,context)
  assert.deepEqual(after.accounts,accounts);assert.deepEqual(after.transactions,[])
  assert.equal(after.dailyClosingBalances.cash['2026-10-24'].amount,amount)
  assert.equal(after.dailyClosingBalances.cash['2026-10-24'].source,'user-recorded')
  assert.equal(after.dailyClosingBalances.cash['2026-10-24'].updatedBy,'Larry')
  assert.deepEqual(restorePersistedFinanceData(after).dailyClosingBalances,after.dailyClosingBalances)
  assert.equal(validatePlaidFinanceUpdate({...after,accounts:after.accounts.map(a=>a.id==='cash'?{...a,balance:950,plaidCurrentBalance:950}:a)},after),'')
 }
})
test('account scope never applies one account correction to another or a partial total',()=>{
 const records=applyRecordOperation(state,operation(0),undefined,context).after.dailyClosingBalances
 assert.deepEqual(scopedClosingBalances([accounts[0]],records),{'2026-10-24':0})
 assert.deepEqual(scopedClosingBalances([accounts[1]],records),{})
 assert.deepEqual(scopedClosingBalances(accounts,records),{})
 records.save={'2026-10-24':{amount:100,source:'user-recorded'}}
 assert.deepEqual(scopedClosingBalances(accounts,records),{'2026-10-24':100})
})
test('unknown historical closes never fall back to scheduled payments; corrections do not replace current bank anchor',()=>{
 const plans=[{id:'old',name:'Unpaid plan',acct:'cash',type:'expense',amount:10000,freq:'once',start:'2026-10-24'}]
 const options={today:'2026-10-25',days:1,pastDays:2}
 const baseline=buildOutstandingCashForecast([accounts[0]],plans,[],options)
 assert.equal(baseline.get('2026-10-24').bal,undefined)
 const result=buildOutstandingCashForecast([accounts[0]],plans,[],{...options,reconstructedBalances:{'2026-10-24':500},recordedClosingBalances:{'2026-10-24':0}})
 assert.equal(result.get('2026-10-24').bal,0)
 assert.equal(result.get('2026-10-24').balanceSource,'user-recorded')
 assert.equal(result.get('2026-10-25').bal,baseline.get('2026-10-25').bal)
})
test('ending balance removal, authorization, malformed input and missing accounts are enforced',()=>{
 const op=operation()
 assert.equal(permissionForOperation({operation:op,member:'Terica',role:'member',permissions:{finance:true}}).allowed,false)
 assert.throws(()=>normalizeActionOperation({...op,targetDate:'bad'}),/exact account/)
 assert.throws(()=>operation(NaN),/valid number/)
 assert.throws(()=>applyRecordOperation(state,{...op,targetId:'missing'},undefined,context),/existing/)
 assert.throws(()=>applyRecordOperation(state,{...op,targetDate:'2026-10-26'},undefined,context),/today or an earlier/)
 const after=applyRecordOperation(state,op,undefined,context).after
 const remove=normalizeActionOperation({type:'finance.close.delete',targetId:'cash',targetDate:'2026-10-24',payload:{}})
 const removed=applyRecordOperation(after,remove,undefined,context).after
 assert.deepEqual(removed.dailyClosingBalances.cash,{})
 assert.deepEqual(removed.accounts,accounts)
})

test('future projected closes are reviewed account-specific overrides, never recorded bank history',()=>{
 const op=normalizeActionOperation({type:'finance.forecast-close.set',targetId:'cash',targetDate:'2026-10-27',payload:{amount:0,notes:'Forecast assumption'}})
 assert.equal(resourceForOperation(op),'shared:lslj_finance_v9')
 assert.equal(permissionForOperation({operation:op,member:'Terica',role:'member',permissions:{finance:true}}).allowed,false)
 const {after}=applyRecordOperation(state,op,undefined,context)
 assert.equal(after.projectedClosingBalances.cash['2026-10-27'].source,'user-projected')
 assert.equal(after.dailyClosingBalances,undefined)
 assert.deepEqual(after.accounts,accounts)
 assert.throws(()=>applyRecordOperation(state,{...op,targetDate:'2026-10-25'},undefined,context),/future date/)
 const plans=[{id:'expense',acct:'cash',type:'expense',amount:50,freq:'once',start:'2026-10-28'},{id:'transfer',acct:'cash',transferTo:'save',type:'transfer',amount:20,freq:'once',start:'2026-10-29'}]
 const opts={today:'2026-10-25',days:6,pastDays:1,projectedClosingBalances:after.projectedClosingBalances}
 const all=buildOutstandingCashForecast(accounts,plans,[],opts)
 const one=buildOutstandingCashForecast([accounts[0]],plans,[],opts)
 const other=buildOutstandingCashForecast([accounts[1]],[],[],opts)
 assert.equal(all.get('2026-10-26').bal,1000)
 assert.equal(all.get('2026-10-27').bal,100)
 assert.equal(one.get('2026-10-27').bal,0)
 assert.equal(all.get('2026-10-28').bal,50)
 assert.equal(one.get('2026-10-29').bal,-70)
 assert.equal(all.get('2026-10-29').bal,50)
 assert.equal(other.get('2026-10-27').bal,100)
 assert.equal(all.get('2026-10-27').isOverridden,true)
 assert.equal(all.get('2026-10-25').currentBalance,1000)
 const expired=buildOutstandingCashForecast(accounts,[],[],{...opts,today:'2026-10-28'})
 assert.equal(expired.get('2026-10-28').bal,1000)
 const remove=normalizeActionOperation({...op,type:'finance.forecast-close.delete',payload:{}})
 assert.deepEqual(applyRecordOperation(after,remove,undefined,context).after.projectedClosingBalances.cash,{})
 assert.deepEqual(restorePersistedFinanceData(after).projectedClosingBalances,after.projectedClosingBalances)
})

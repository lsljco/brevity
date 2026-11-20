import test from 'node:test'
import assert from 'node:assert/strict'
import {financeOverviewModel} from './financeOverviewModel.js'

test('overview shares the forecast bank anchor, month end and dated floor',()=>{
  const model=financeOverviewModel({accounts:[{type:'checking',balance:4500},{type:'credit',balance:-10000}],today:'2026-10-24',live:true,transactionStatus:'fresh',projection:new Map([
    ['2026-10-23',{bal:-9000}],['2026-10-24',{anchorBalance:4300,bal:2925,unresolvedPastCount:3}],
    ['2026-10-28',{bal:-125}],['2026-10-31',{bal:1000}],['2026-11-25',{bal:-8000}],
  ])})
  assert.equal(model.cash,4300)
  assert.equal(model.monthEnd,1000)
  assert.deepEqual(model.floor,{date:'2026-10-28',balance:-125})
  assert.deepEqual(model.attention.map(item=>item.id),['shortfall','earlier'])
})
test('missing cash evidence remains unavailable even when projection supplies zero',()=>{
  for(const accounts of [[],[{type:'checking',balance:null}],[{type:'checking',balance:''}]]){
    const model=financeOverviewModel({accounts,today:'2026-10-24',projection:new Map([['2026-10-24',{anchorBalance:0,bal:0}],['2026-10-31',{bal:0}]])})
    assert.equal(model.cash,null);assert.equal(model.monthEnd,null);assert.equal(model.floor,null)
    assert.equal(model.attention[0].id,'bank')
  }
})
test('a real zero and leap-year month end remain valid',()=>{
  const model=financeOverviewModel({accounts:[{type:'savings',balance:0}],today:'2028-02-20',live:true,transactionStatus:'fresh',projection:new Map([['2028-02-29',{bal:0}]])})
  assert.equal(model.monthEndDate,'2028-02-29');assert.equal(model.cash,0);assert.equal(model.monthEnd,0)
  assert.deepEqual(model.attention,[])
})
test('incomplete source status is actionable without inventing spending recommendations',()=>{
  const model=financeOverviewModel({accounts:[{type:'checking',balance:100}],today:'2026-12-31',live:true,transactionStatus:'partial',unmappedCount:4})
  assert.equal(model.monthEnd,null)
  assert.deepEqual(model.attention.map(item=>item.id),['bank','unmapped'])
})

test('current and available snapshots explain Home/Finance variance without double-counting holds',async()=>{
  const {buildOutstandingCashForecast}=await import('./outstandingCashForecast.js')
  const {dailyFinancialBrief}=await import('./dailyFinancialBrief.js')
  // Synthetic values: no household financial records in regression fixtures.
  const accounts=[{id:'a1',name:'Operating',type:'checking',balance:875,plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,plaidAvailableBalance:875}]
  const actuals=[{id:'hold',accountId:'bank',date:'2026-11-19',amount:125,pending:true}]
  const projection=buildOutstandingCashForecast(accounts,[],actuals,{today:'2026-11-19',days:40,pastDays:1,reconcile:true})
  const home=dailyFinancialBrief({date:'2026-11-19',finance:{accounts,transactions:[]},actuals})
  const overview=financeOverviewModel({accounts,projection,today:'2026-11-19'})
  assert.equal(home.operatingBalance,overview.bankCurrent)
  assert.equal(overview.cash,875)
  assert.equal(overview.cashLabel,'Bank available balance')
  assert.equal(overview.availabilityDifference,-125)
  assert.equal(overview.bankCurrent+overview.availabilityDifference,overview.cash)
  assert.equal(projection.get('2026-11-19').pendingDelta,0)
  assert.equal(projection.get('2026-11-19').bal,875)
})
test('mixed and missing evidence never claims a bank available balance or invents a bridge',()=>{
  for(const anchorKind of ['mixed','current',undefined]) {
    const m=financeOverviewModel({accounts:[{type:'checking',balance:0,plaidCurrentBalance:0}],today:'2026-11-19',projection:new Map([['2026-11-19',{anchorBalance:0,anchorKind}]])})
    assert.notEqual(m.cashLabel,'Bank available balance');assert.equal(m.availabilityDifference,null)
  }
  const m=financeOverviewModel({accounts:[{type:'checking',balance:0,plaidCurrentBalance:null}],today:'2026-11-19',projection:new Map([['2026-11-19',{anchorBalance:0,anchorKind:'available'}]])})
  assert.equal(m.bankCurrent,null);assert.equal(m.availabilityDifference,null)
})

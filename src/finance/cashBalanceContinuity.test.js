import test from 'node:test'
import assert from 'node:assert/strict'
import {buildOutstandingCashForecast} from './outstandingCashForecast.js'
import {forecastPlanPresentation} from './forecastPlanPresentation.js'
const account={id:'a',name:'Operating',type:'checking',plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:2845.88,plaidAvailableBalance:1811.42,balance:1811.42}
const grocery={id:'grocery',name:'Groceries',cat:'Food',acct:'a',type:'expense',amount:300,freq:'weekly',start:'2026-11-06'}
const opts={today:'2026-11-02',days:35,pastDays:2,reconstructedBalances:{'2026-11-01':2845.88}}
test('Nov 2 bridge explains holds once and leaves all four grocery dates intact',()=>{
 const actuals=[{id:'old',name:'Other',accountId:'bank',amount:961.95,date:'2026-10-31',pending:true},{id:'new',name:'Other',accountId:'bank',amount:72.51,date:'2026-11-02',pending:true}]
 const p=buildOutstandingCashForecast([account],[grocery],actuals,opts),today=p.get(opts.today)
 assert.equal(today.bal,1811.42)
 assert.equal(today.availabilityDelta,-1034.46)
 assert.equal(today.pendingDelta,0)
 assert.equal(today.bankReconciliationDelta,0)
 assert.equal(today.openingBalance+today.postedTodayDelta+today.bankReconciliationDelta+today.availabilityDelta+today.pendingDelta+today.remainingDelta,today.bal)
 for(const [i,date] of ['2026-11-06','2026-11-13','2026-11-20','2026-11-27'].entries()){
  assert.equal(p.get(date).bal,Math.round((1811.42-300*(i+1))*100)/100)
  assert.equal(p.get(date).realization[0].delta,-300)
  assert.deepEqual(forecastPlanPresentation(grocery,p.get(date)),{matched:false,pooled:true,amount:300,label:''})
 }
 assert.equal(p.get('2026-12-01').remainingDelta,0)
 assert.equal(p.get('2026-12-04').remainingDelta,-300)
})
test('posted purchases reduce earliest scheduled grocery capacity and are not bank matches',()=>{
 const p=buildOutstandingCashForecast([account],[grocery],[{id:'p',name:'Market',category:'Food',accountId:'bank',date:'2026-11-01',amount:350}],opts)
 assert.equal(p.get('2026-11-06').remainingDelta,0)
 assert.equal(p.get('2026-11-13').remainingDelta,-250)
 assert.equal(p.get('2026-11-20').remainingDelta,-300)
 assert.equal(forecastPlanPresentation(grocery,p.get('2026-11-06')).matched,false)
 assert.equal(forecastPlanPresentation(grocery,p.get('2026-11-06')).label,'Category already spent · ')
})
test('bank snapshot mismatch is explicit and recorded prior closing balance is respected',()=>{
 const p=buildOutstandingCashForecast([account],[],[{id:'posted',accountId:'bank',date:'2026-11-02',amount:50}],{...opts,recordedClosingBalances:{'2026-11-01':3000}}).get(opts.today)
 assert.equal(p.openingBalance,3000)
 assert.equal(p.openingSource,'verified-close')
 assert.equal(p.postedTodayDelta,-50)
 assert.equal(p.bankReconciliationDelta,-104.12)
 assert.equal(p.bal,1811.42)
})
test('only actual bank matches receive the matched label',()=>{
 assert.equal(forecastPlanPresentation(grocery,{realization:[{id:grocery.id,delta:0,statuses:[{status:'category-allowance'}]}]}).matched,false)
 assert.equal(forecastPlanPresentation(grocery,{realization:[{id:grocery.id,delta:0,statuses:[{status:'posted',actualId:'bank-tx'}]}]}).matched,true)
})

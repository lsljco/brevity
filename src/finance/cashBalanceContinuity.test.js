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

test('historical cash deducts outstanding expenses on their dates and rolls into Nov 2 once',()=>{
 const actuals=[['2026-10-29',16.69],['2026-10-30',183.08],['2026-10-31',513.69],['2026-11-01',248.49],['2026-11-02',72.51]].map(([date,amount],i)=>({id:`pending-${i}`,date,amount,accountId:'bank',pending:true}))
 const raw={'2026-10-30':2845.88,'2026-10-31':2845.88,'2026-11-01':2845.88}
 const p=buildOutstandingCashForecast([account],[],actuals,{...opts,pastDays:5,reconstructedBalances:raw})
 assert.equal(p.get('2026-10-30').bal,2646.11)
 assert.equal(p.get('2026-10-31').bal,2132.42)
 assert.equal(p.get('2026-11-01').bal,1883.93)
 assert.equal(p.get('2026-11-02').bal,1811.42)
 assert.equal(p.get('2026-11-02').availableOpeningBalance,1883.93)
 assert.equal(p.get('2026-11-02').newPendingDelta,-72.51)
 assert.equal(p.get('2026-11-02').cashReconciliationDelta,0)
 assert.equal(p.get('2026-11-01').postedBalance,2845.88)
 assert.deepEqual(raw,{'2026-10-30':2845.88,'2026-10-31':2845.88,'2026-11-01':2845.88})
})

test('settled expenses replace pending holds and are deducted once in the historical roll-forward',async()=>{
 const {buildDatedCashLedger}=await import('./datedCashLedger.js')
 const a={...account,plaidCurrentBalance:2083.70,plaidAvailableBalance:2011.19}
 const actuals=[{id:'old',accountId:'bank',date:'2026-10-31',amount:513.69,pending:true},{id:'settled',accountId:'bank',date:'2026-10-31',amount:513.69,pendingTransactionId:'old'},{id:'sunday',accountId:'bank',date:'2026-11-01',amount:248.49},{id:'monday',accountId:'bank',date:'2026-11-02',amount:72.51,pending:true}]
 const ledger=buildDatedCashLedger({accounts:[a],transactions:actuals,today:opts.today,balanceHistory:[{date:'2026-10-30',kind:'intraday',balances:{bank:2845.88}}]})
 const p=buildOutstandingCashForecast(ledger.forecastAccounts,[],actuals,{...opts,pastDays:5,reconstructedBalances:ledger.balances})
 assert.equal(p.get('2026-10-30').bal,2845.88)
 assert.equal(p.get('2026-10-31').bal,2332.19)
 assert.equal(p.get('2026-11-01').bal,2083.70)
 assert.equal(p.get('2026-11-01').historicalPendingDelta,0)
 assert.equal(p.get(opts.today).bal,2011.19)
})

test('recorded historical closes are preserved and mixed bank differences remain explicit',()=>{
 const p=buildOutstandingCashForecast([account],[],[{id:'hold',accountId:'bank',date:'2026-11-01',amount:50,pending:true}],{...opts,recordedClosingBalances:{'2026-11-01':1900}})
 assert.equal(p.get('2026-11-01').bal,1900)
 assert.equal(p.get(opts.today).availableOpeningBalance,1900)
 assert.equal(p.get(opts.today).cashReconciliationDelta,-88.58)
 assert.equal(p.get(opts.today).bal,1811.42)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverRecurring, discoveryMonths, recurringCoverage } from './recurringDiscovery.js'
import { applyBudgetTarget } from './budgetBreakdown.js'
const today='2026-10-02',accountMap={bank:'a1'}
const monthly=(name='Apple',amounts=[200,200,200,200,200,200])=>amounts.map((amount,i)=>({id:`${name}-${i}`,name,merchant_name:name,accountId:'bank',date:`2026-${String(i+4).padStart(2,'0')}-15`,amount,category:'Subscriptions'}))
const report=rows=>discoverRecurring(rows,{today,accountMap})
test('uses six completed months across year boundaries and detects variable amounts',()=>{
 assert.deepEqual(discoveryMonths('2026-02-01'),['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01'])
 const s=report(monthly('Utility',[100,150,300,250,200,200])).suggestions[0]
 assert.equal(s.monthsSeen,6);assert.equal(s.amount,200);assert.equal(s.stableAmount,false);assert.equal(s.proposedDate,'2026-10-15')
})
test('sums monthly vendor charges without inventing a single posting date',()=>{
 const rows=[...monthly(),...monthly().map(tx=>({...tx,id:tx.id+'extra',amount:10,date:tx.date.slice(0,8)+'22'}))]
 const s=report(rows).suggestions[0];assert.equal(s.amount,210);assert.equal(s.proposedDate,'');assert.equal(s.multiple,true)
})
test('separates accounts and excludes pending transfers refunds duplicates and future activity',()=>{
 const rows=monthly();rows.push({...rows[0]},{...rows[0],id:'pending',pending:true},{...rows[0],id:'refund',amount:-200,name:'Purchase refund',merchant_name:'Apple'},...monthly('Transfer').map(tx=>({...tx,category:'TRANSFER_OUT'})),...monthly().map(tx=>({...tx,id:tx.id+'other',accountId:'other'})),{...rows[0],id:'future',date:'2026-10-30'})
 const r=report(rows);assert.equal(r.suggestions.length,2);assert.equal(r.suggestions[0].amount,200);assert.equal(r.suggestions[0].currentCount,0)
})
test('shows current posted totals and avoids suggesting an already-paid monthly occurrence',()=>{
 const s=report([...monthly(),{...monthly()[0],id:'current',date:today}]).suggestions[0]
 assert.equal(s.currentTotal,200);assert.equal(s.proposedDate,'2026-11-15')
})
test('recognizes biweekly income with a per-deposit amount',()=>{
 const rows=[];for(let d=new Date('2026-04-03T12:00:00Z');d.toISOString().slice(0,10)<today;d.setUTCDate(d.getUTCDate()+14))rows.push({id:d.toISOString(),name:'Payroll',category:'INCOME',date:d.toISOString().slice(0,10),amount:-1000,accountId:'bank'})
 const s=report(rows).suggestions[0];assert.equal(s.frequency,'biweekly');assert.equal(s.amount,1000);assert.equal(s.proposedDate,'2026-10-02');assert.ok(s.monthlyAmount>2000)
})
test('surfaces emerging patterns without mislabeling missing history',()=>{
 const r=report(monthly().slice(4));assert.equal(r.observedMonths,2);assert.equal(r.suggestions[0].confidence,'Emerging');assert.equal(r.suggestions[0].history[0].count,0)
})
test('checks account-scoped budget targets, category coverage and scheduled duplicates',()=>{
 const s=report(monthly()).suggestions[0]
 const scheduled=[{id:'apple',name:'Apple',acct:'a1',type:'expense',cat:'Subscriptions',freq:'monthly',start:'2026-04-15',amount:200},{id:'other',name:'Streaming',acct:'a1',type:'expense',cat:'Subscriptions',freq:'monthly',start:'2026-04-15',amount:100}]
 let c=recurringCoverage(s,{scheduled,today});assert.equal(c.exactAmount,200);assert.equal(c.categoryAmount,100);assert.equal(c.forecast.length,1)
 assert.equal(recurringCoverage(s,{scheduled,today,accountId:'a2'}).forecast.length,0)
 const budget=applyBudgetTarget({}, {lineId:'discovered-apple',accountId:'a1',direction:'expense',lineName:'Apple',category:'Subscriptions',year:2026,month:9,value:220})
 c=recurringCoverage(s,{budget,today});assert.equal(c.exactAmount,220);assert.equal(c.forecast.length,0)
})
test('a discovery budget target follows its subsequently approved cash plan without double counting',()=>{
 const s=report(monthly()).suggestions[0]
 const budget=applyBudgetTarget({}, {lineId:'discovered:apple',accountId:'a1',direction:'expense',lineName:'Apple',category:'Subscriptions',year:2026,month:9,value:220})
 const scheduled=[{id:'created-later',name:'Apple',acct:'a1',type:'expense',cat:'Subscriptions',freq:'monthly',start:'2026-10-15',amount:200}]
 const c=recurringCoverage(s,{budget,scheduled,today});assert.equal(c.exactAmount,220);assert.equal(c.exact.length,1);assert.equal(c.exact[0].recordId,'created-later')
})

test('discovery budget identity survives server Action Mode normalization',async()=>{
 const {discoveryBudgetLineId}=await import('./recurringDiscovery.js')
 const {normalizeActionOperation}=await import('../../netlify/lib/assistant-action-contract.mjs')
 const s=report(monthly()).suggestions[0],lineId=discoveryBudgetLineId(s,'a1')
 const operation=normalizeActionOperation({type:'budget.update',targetId:lineId,payload:{lineId,lineName:'Apple',recordId:'',direction:'expense',accountId:'a1',category:'Subscriptions',year:2026,month:9,value:200}})
 assert.equal(operation.targetId,operation.payload.lineId)
 assert.notEqual(lineId,discoveryBudgetLineId(s,'a2'))
})

test('monthly forecasts preserve month-end billing in short and leap months',async()=>{
 const {txOccursOnDate}=await import('./projection.js')
 const {calculateTransactionAmountForMonth}=await import('./monthlyCashFlow.js')
 const tx={id:'month-end',name:'Apple',acct:'a1',type:'expense',freq:'monthly',start:'2024-01-31',amount:200}
 assert.equal(txOccursOnDate(tx,new Date(2024,1,29)),true)
 assert.equal(txOccursOnDate(tx,new Date(2025,1,28)),true)
 assert.equal(txOccursOnDate(tx,new Date(2026,3,30)),true)
 assert.equal(txOccursOnDate(tx,new Date(2026,4,30)),false)
 assert.equal(txOccursOnDate(tx,new Date(2026,4,31)),true)
 assert.equal(calculateTransactionAmountForMonth(tx,new Date(2026,1,1)),200)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {buildOutstandingCashForecast} from './outstandingCashForecast.js'
import {applyBudgetTarget} from './budgetBreakdown.js'
const account={id:'a',name:'Operating',type:'checking',plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,plaidAvailableBalance:950,balance:950}
const budget=applyBudgetTarget({},{accountId:'a',lineId:'allowance-food',lineName:'Food allowance',category:'Food',direction:'expense',month:9,year:2026,value:300,cashAllowance:true},{changedAt:'2026-09-25T12:00:00Z'})
test('category allowance reserves only unspent, unheld, unscheduled capacity; bank available holds count once',()=>{
 const actuals=[{id:'posted',accountId:'bank',date:'2026-10-20',amount:100,category:'Food'},{id:'hold',accountId:'bank',date:'2026-10-25',amount:50,category:'Food',pending:true}]
 const scheduled=[{id:'groceries',acct:'a',name:'Groceries',cat:'Food',type:'expense',amount:80,freq:'once',start:'2026-10-28'}]
 const p=buildOutstandingCashForecast([account],scheduled,actuals,{today:'2026-10-25',days:6,pastDays:6,reconcile:true,budget})
 assert.equal(p.get('2026-10-25').budgetAllowanceDelta,-70)
 assert.equal(p.get('2026-10-25').bal,880)
 assert.equal(p.get('2026-10-28').bal,800)
})
test('ordinary budget targets do not invent extra scheduled payments',()=>{
 const plain=structuredClone(budget);plain.lines['allowance-food'].cashAllowance=false
 const p=buildOutstandingCashForecast([account],[],[],{today:'2026-10-25',days:2,reconcile:true,budget:plain})
 assert.equal(p.get('2026-10-25').bal,950)
})

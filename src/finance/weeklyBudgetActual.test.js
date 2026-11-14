import test from 'node:test'
import assert from 'node:assert/strict'
import {weeklyBudgetActual,budgetWeek} from './weeklyBudgetActual.js'
import {meetingBudgetActual} from './meetingBudgetActual.js'
const data={accounts:[{id:'a',plaidAccountId:'bank'}],transactionFreshnessStatus:'fresh',scheduled:[{id:'g',acct:'a',name:'Groceries',cat:'Groceries',type:'expense',amount:300,freq:'weekly',start:'2026-11-01'},{id:'t',acct:'a',name:'Travelers',cat:'Insurance',type:'expense',amount:1600,freq:'monthly',start:'2026-11-02'}],actuals:[{id:'g1',accountId:'bank',name:'Groceries',category:'Groceries',_categoryResolved:true,date:'2026-11-03',amount:500},{id:'t1',accountId:'bank',name:'Travelers',category:'Insurance',date:'2026-11-04',amount:1800},{id:'later',accountId:'bank',name:'Groceries',category:'Groceries',_categoryResolved:true,date:'2026-11-10',amount:400}],budget:{categoryLimits:{g:{accountId:'a',month:'2026-11',category:'Groceries',amount:1200}}}}
test('weekly occurrence targets differ from whole monthly targets',()=>{
 const week=weeklyBudgetActual(data,'2026-11-03','2026-11-14')
 const groceries=week.rows.find(r=>r.category==='Groceries'),travelers=week.items.find(r=>r.category==='Travelers')
 assert.equal(groceries.budget,300);assert.equal(groceries.posted,500)
 assert.equal(travelers.budget,1600);assert.equal(travelers.posted,1800)
 const month=meetingBudgetActual(data,'2026-11','2026-11-14').rows.find(r=>r.category==='Groceries')
 assert.equal(month.budget,1200);assert.equal(month.posted,900)
 const next=weeklyBudgetActual(data,'2026-11-10','2026-11-14')
 assert.equal(next.items.some(r=>r.category==='Travelers'),false)
})
test('cross-month weeks keep their full seven-day dates',()=>assert.deepEqual(budgetWeek('2026-12-01'),{from:'2026-11-29',end:'2026-12-05'}))
test('pending transfers and future posted dates are excluded; unmatched spending stays visible',()=>{
 const model=weeklyBudgetActual({...data,actuals:[...data.actuals,{id:'u',accountId:'bank',date:'2026-11-03',name:'Other insurer',category:'Insurance',amount:50},{id:'p',accountId:'bank',date:'2026-11-04',name:'Pending',amount:99,pending:true}]},'2026-11-03','2026-11-03')
 assert.equal(model.transactions.length,2)
 assert.equal(model.items.find(r=>r.category==='Other insurer').unmatched,true)
 assert.equal(model.items.find(r=>r.category==='Travelers').posted,0)
})

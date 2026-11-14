import test from 'node:test'
import assert from 'node:assert/strict'
import {meetingBudgetActual,budgetActualMatches} from './meetingBudgetActual.js'
test('thresholds are strictly greater and missing targets remain unknown',()=>{
 const row={direction:'expense',budget:100,posted:75}
 assert.equal(budgetActualMatches(row,'expense','75',75),false)
 assert.equal(budgetActualMatches(row,'expense','50',50),true)
 assert.equal(budgetActualMatches(row,'income','all'),false)
 assert.equal(budgetActualMatches({...row,budget:0},'expense','over'),true)
 assert.equal(budgetActualMatches({...row,budget:null},'expense','over'),false)
 assert.equal(budgetActualMatches({...row,budget:null},'all','missing'),true)
})
test('month actuals retain unclassified expenses, recognize income, exclude pending and transfers',()=>{
 const model=meetingBudgetActual({accounts:[{id:'a',plaidAccountId:'bank',name:'Operating'}],scheduled:[],budget:{},actuals:[
 {id:'1',accountId:'bank',date:'2026-11-02',amount:40,name:'Unknown merchant',category:'Uncategorized'},
 {id:'2',accountId:'bank',date:'2026-11-03',amount:-1000,name:'Payroll',category:'Income'},
 {id:'3',accountId:'bank',date:'2026-11-04',amount:90,name:'Pending',pending:true},
 {id:'4',accountId:'bank',date:'2026-10-31',amount:70,name:'Old'},
 {id:'5',accountId:'bank',date:'2026-11-05',amount:200,type:'transfer',name:'Transfer'},
 ]},'2026-11','2026-11-14')
 assert.equal(model.unclassified.length,1)
 assert.equal(model.rows.find(r=>r.direction==='income').posted,1000)
 assert.equal(model.rows.find(r=>r.category==='Uncategorized').posted,40)
 assert.equal(model.transactions.length,2)
})
test('category limits replace line targets within each account and consolidate once',()=>{
 const data={accounts:[{id:'a',plaidAccountId:'bank'}],transactionFreshnessStatus:'fresh',budget:{categoryLimits:{food:{accountId:'a',month:'2026-11',category:'Food',amount:300}}},actuals:[],scheduled:[]}
 const model=meetingBudgetActual(data,'2026-11','2026-11-14')
 assert.equal(model.rows.length,1);assert.equal(model.rows[0].budget,300);assert.equal(model.rows[0].posted,0)
})

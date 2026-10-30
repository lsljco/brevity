import test from 'node:test'
import assert from 'node:assert/strict'
import {budgetCoverage,hasBudgetActualsSnapshot} from './budgetCoverage.js'
const row=(id,amount,extra={})=>({id,amount,accountId:'bank',date:'2026-10-30',category:'Food',...extra})
test('coverage separates posted spending, transfers, hidden, pending and account exclusions',()=>{
 const raw=[row('expense',10.25),row('transfer',20,{category:'Transfer'}),row('hidden',5),row('pending',7,{pending:true}),row('outside',30,{accountId:'other'}),row('unknown',40,{accountId:'unknown'}),row('income',-100),row('prior',50,{date:'2026-09-30'})]
 const before=JSON.stringify(raw)
 const c=budgetCoverage({rawActuals:raw,includedActuals:raw.filter(t=>t.id!=='hidden'),accountMap:{bank:'operating',other:'savings'},accountIds:['operating'],month:'2026-10'})
 assert.equal(c.scopedPostedDebits,35.25)
 assert.equal(c.expenses.amount,10.25);assert.equal(c.transfers.amount,20);assert.equal(c.hidden.amount,5)
 assert.equal(c.pending.amount,7);assert.equal(c.outside.amount,30);assert.equal(c.unmapped.amount,40)
 assert.equal(c.scopedPostedDebits,c.expenses.amount+c.transfers.amount+c.hidden.amount+c.otherExcluded.amount)
 assert.equal(JSON.stringify(raw),before)
})
test('broad scope exposes unmapped ownership even when included; uncategorized debits remain expenses',()=>{
 const raw=[row('unknown',1.11,{accountId:'unknown',category:''}),row('bad',null)]
 const c=budgetCoverage({rawActuals:raw,includedActuals:raw,month:'2026-10',includeUnmapped:true})
 assert.equal(c.expenses.amount,1.11);assert.equal(c.unmapped.count,1);assert.equal(c.invalid.count,1)
})

test('missing bank history is unknown while a verified empty snapshot is zero activity',()=>{
 assert.equal(hasBudgetActualsSnapshot([], 'fresh'),true)
 for(const status of ['unknown','stale','partial','error',undefined]) assert.equal(hasBudgetActualsSnapshot([],status),false)
 assert.equal(hasBudgetActualsSnapshot([row('retained',10)],'stale'),true)
})

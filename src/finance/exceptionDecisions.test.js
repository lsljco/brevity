import test from 'node:test'
import assert from 'node:assert/strict'
import {accountLinkGroups} from './accountLinkReview.js'
import {exceptionSignature,readExceptionDismissals,dismissException,filterGroupTransactions,canAcceptMatch,buildExceptionMatchReport} from './exceptionDecisions.js'

test('group drilldowns retain all source rows, pending records and missing identities without changing sources',()=>{
 const rows=Array.from({length:71},(_,i)=>({id:String(i),accountId:i%2?'old-bank':'new-bank',date:`2026-11-${String(1+i%20).padStart(2,'0')}`,amount:i,pending:i%3===0}))
 rows.push({id:'unknown',name:'Missing source'})
 const before=structuredClone(rows),groups=accountLinkGroups([],rows,[])
 assert.equal(groups.reduce((n,g)=>n+g.transactions.length,0),72)
 for(const group of groups){assert.equal(group.count,group.transactions.length);assert.ok(group.transactions.every(r=>(r.accountId||'')===group.sourceId));assert.equal(group.suggestion,null)}
 assert.deepEqual(rows,before)
})
test('group search and pending filter do not remove retained source records',()=>{
 const rows=[{name:'Payroll',date:'2026-11-20',amount:-8487.84,pending:true},{name:'Card',originalStatement:'SYNCHRONY PAYMENT',date:'2026-11-19',amount:321,pending:false}]
 assert.equal(filterGroupTransactions(rows,{query:'synchrony',status:'posted'}).length,1)
 assert.equal(filterGroupTransactions(rows,{query:'8487.84',status:'pending'}).length,1)
 assert.equal(filterGroupTransactions(rows,{status:'posted'}).length,1)
 assert.equal(rows.length,2)
})
test('dismissals survive reload, remain presentation-only and changed bank evidence returns to review',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}
 const row={id:'plan:date:bank',evidence:{actualAmount:321,budgetAmount:337}},before=structuredClone(row)
 const signature=exceptionSignature('match',row)
 dismissException(storage,[],signature)
 assert.deepEqual(readExceptionDismissals(storage),[signature])
 assert.notEqual(exceptionSignature('match',{...row,evidence:{...row.evidence,actualAmount:337}}),signature)
 assert.deepEqual(row,before)
 assert.deepEqual(readExceptionDismissals({getItem:()=>'{invalid'}),[])
})
test('underpayments cannot accept a full-paid match while full payments and received income can',()=>{
 assert.equal(canAcceptMatch({plan:{type:'expense'},amountVariance:-16}),false)
 assert.equal(canAcceptMatch({plan:{type:'expense'},amountVariance:0}),true)
 assert.equal(canAcceptMatch({plan:{type:'income'},amountVariance:-16}),true)
})
test('a unique partial payment becomes an editable exception without a full-paid action',()=>{
 const account={id:'cash',plaidAccountId:'bank',type:'checking',plaidType:'depository',plaidSubtype:'checking'}
 const plan={id:'card',name:'Synchrony card payment',type:'expense',amount:337,acct:'cash',start:'2026-11-20',freq:'once'}
 const bank={id:'posted',name:'Synchrony',accountId:'bank',date:'2026-11-20',amount:321,pending:false}
 const input={accounts:[account],scheduled:[plan],actuals:[bank],today:'2026-11-20'}
 const report=buildExceptionMatchReport(input)
 assert.equal(report.suggestions.length,1)
 assert.equal(report.suggestions[0].amountVariance,-16)
 assert.equal(canAcceptMatch(report.suggestions[0]),false)
 assert.equal(report.unresolved.length,0)
 assert.equal(plan.amount,337)
 assert.equal(buildExceptionMatchReport({...input,actuals:[{...bank,pending:true}]}).suggestions.length,0)
 assert.equal(buildExceptionMatchReport({...input,scheduled:[plan,{...plan,id:'ambiguous'}]}).suggestions.length,0)
})

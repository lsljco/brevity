import test from 'node:test'
import assert from 'node:assert/strict'
import {buildRuleSuggestions,suggestionOperation} from './ruleSuggestions.js'
import {applyTransactionRules} from './transactionRules.js'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
const accounts=[{id:'a1',plaidAccountId:'bank'}]
const directory={vendors:[{id:'v1',name:'Travelers',aliases:[]}],links:{}}
const plan={id:'plan',name:'Travelers Insurance',type:'expense',cat:'Insurance',acct:'a1',vendorId:'v1',amount:1600}
const tx={id:'tx',name:'Travelers Insurance charge',merchant_name:'Travelers',amount:1800,accountId:'bank',date:'2025-01-01',pending:false}
const report=(extra={})=>buildRuleSuggestions({planned:[plan],transactions:[tx],accounts,directory,...extra})
test('new actuals continuously produce grouped proposals based on projected identity, not equal amounts',()=>{
 const r=report({transactions:[tx,{...tx,id:'next',date:'2026-11-15'}, {...tx,id:'random',name:'Unknown',merchant_name:'Unknown',amount:1600}]})
 assert.equal(r.suggestions.length,1);assert.equal(r.suggestions[0].transactions.length,2);assert.equal(r.unresolved.length,1)
 assert.equal(r.suggestions[0].category,'Insurance');assert.equal(r.suggestions[0].vendorId,'v1')
 const op=suggestionOperation(r.suggestions[0],'2026-11-15');assert.equal(op.payload.applyToExisting,true)
 const result=applyRecordOperation([],op,()=> 'created')
 const rule=result.after[0]
 assert.equal(rule.id,'created')
 assert.equal(applyTransactionRules(tx,[rule],accounts).category,'Insurance')
 assert.equal(applyTransactionRules({...tx,id:'future',date:'2027-01-01'},[rule],accounts)._ruleVendorId,'v1')
 assert.equal(report({rules:[rule]}).suggestions.length,0)
})
test('same amount, pending, different direction, and different bank account cannot create a false proposal',()=>{
 for(const changes of [{pending:true},{amount:-1800},{accountId:'other'},{name:'Some other payment',merchant_name:'Other'}])assert.equal(report({transactions:[{...tx,...changes}]}).suggestions.length,0)
})
test('conflicting projected categories stay unresolved and missing vendors need review',()=>{
 assert.equal(report({planned:[plan,{...plan,id:'two',cat:'Other'}]}).suggestions.length,0)
 const row=report({planned:[{...plan,vendorId:''}],directory:{vendors:[],links:{}}}).suggestions[0]
 assert.equal(row.vendorId,'');assert.throws(()=>suggestionOperation(row,'2026-11-15'),/Choose a vendor/)
})
test('reuse established rules and propose past coverage instead of duplicates',()=>{
 const rule={id:'existing',name:'My insurance rule',createdDate:'2026-11-15',applyToExisting:false,conditions:{originalStatement:{on:true,match:'contains',value:'Travelers'}},actions:{updateCategory:{on:true,value:'Insurance'}}}
 const row=report({rules:[rule]}).suggestions[0]
 assert.equal(row.ruleId,'existing');assert.equal(row.vendorId,'v1')
 const operation=suggestionOperation(row,'2026-11-15');assert.equal(operation.type,'transaction.rule.update');assert.equal(operation.targetId,'existing');assert.equal(operation.payload.applyToExisting,true)
})
test('approve all never silently truncates a rule batch at eight operations',()=>{
 const operation=suggestionOperation(report().suggestions[0],'2026-11-15')
 const proposal=normalizeActionProposal({operations:Array.from({length:12},()=>structuredClone(operation))},{member:'Larry',role:'admin'})
 assert.equal(proposal.operations.length,12)
 assert.throws(()=>normalizeActionProposal({operations:Array.from({length:501},()=>structuredClone(operation))},{member:'Larry',role:'admin'}),/500/)
})

test('Uncategorized display preserves source cash classification until a category is approved',async()=>{
 const {actualTransactionKind,summarizeActualCashActivity}=await import('./reportingData.js')
 const transfer={name:'ACH 123',amount:100,category:'Uncategorized',_reviewSourceCategory:'TRANSFER_OUT'}
 const income={name:'ACH 456',amount:-200,category:'Uncategorized',_reviewSourceCategory:'INCOME',pending:false}
 assert.equal(actualTransactionKind(transfer),'transfer');assert.equal(actualTransactionKind(income),'income')
 assert.equal(summarizeActualCashActivity([transfer,income]).net,200)
 assert.equal(actualTransactionKind({...transfer,category:'Groceries'}),'expense')
})

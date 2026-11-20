import test from 'node:test'
import assert from 'node:assert/strict'
import {accountLinkGroups,accountReviewQueue,reviewedTransactionMetadata} from './accountLinkReview.js'
import {applyTransactionRules} from './transactionRules.js'
const account={id:'operating',name:'Operating',institution:'Example Bank',mask:'1234',type:'checking'}
const source={accountId:'bank',institution:'Example Bank',mask:'1234',type:'depository',subtype:'checking',name:'Checking'}
const rows=[{id:'1',accountId:'bank'},{id:'2',accountId:'bank',pending:true}]
test('account review groups source IDs and suggests only unique matching identity without writes',()=>{
 const before=JSON.stringify({account,source,rows});const [group]=accountLinkGroups([account],rows,[source]);assert.equal(group.count,2);assert.equal(group.pending,1);assert.equal(group.suggestion.id,'operating');assert.equal(JSON.stringify({account,source,rows}),before)
})
test('missing, conflicting, already linked and incompatible identities never suggest a replacement',()=>{
 for(const [accounts,sources] of [[[account],[]],[[account, {...account,id:'duplicate'}],[source]],[[{...account,plaidAccountId:'old'}],[source]],[[account],[{...source,mask:'5678'}]],[[account],[{...source,subtype:'savings'}]],[[account],[source,source]]])assert.equal(accountLinkGroups(accounts,rows,sources)[0].suggestion,null)
 const linked={...account,plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking'};assert.equal(accountLinkGroups([linked],rows,[source]).length,0)
 assert.equal(accountLinkGroups([account],[{id:'missing'}],[source])[0].suggestion,null)
})

test('category review clears only explicitly resolved rows and never deletes bank history or links accounts',()=>{
 const original=[{id:'one',accountId:'unlinked',category:'TRANSPORTATION',pending:false},{id:'two',accountId:'unlinked',category:'TRANSPORTATION',pending:false},{id:'pending',accountId:'unlinked',pending:true}]
 const rows=original.map(row=>reviewedTransactionMetadata(row,row.id==='one'?{category:'Fuel'}:{}))
 assert.equal(accountReviewQueue([],rows,[])[0].count,2)
 assert.equal(accountReviewQueue([],rows,[],{includeResolved:true})[0].count,3)
 assert.equal(original[0].category,'TRANSPORTATION')
 assert.equal(accountReviewQueue([],original.map(r=>reviewedTransactionMetadata(r,{category:'Uncategorized'})),[])[0].count,3)
})

test('a reviewed rule clears all past matches and future posted arrivals; pending and other merchants remain',()=>{
 const rule={id:'fuel',applyToExisting:true,criteria:[{field:'merchantName',operator:'exactly',value:'Fuel Store',join:'and'}],actions:{updateCategory:{on:true,value:'Fuel'}}}
 const bank=[{id:'old',name:'Fuel Store',merchant_name:'Fuel Store',date:'2026-01-01',accountId:'unlinked',pending:false},{id:'new',name:'Fuel Store',merchant_name:'Fuel Store',date:'2026-11-21',accountId:'unlinked',pending:false},{id:'pending',merchant_name:'Fuel Store',pending:true,accountId:'unlinked'},{id:'other',merchant_name:'Other store',pending:false,accountId:'unlinked'}]
 const rows=bank.map(r=>reviewedTransactionMetadata(applyTransactionRules(r,[rule])))
 assert.deepEqual(accountReviewQueue([],rows,[])[0].transactions.map(r=>r.id),['other','pending'])
 assert.equal(accountReviewQueue([],rows,[],{includeResolved:true})[0].count,4)
 assert.equal(accountReviewQueue([],rows.filter(r=>r.id==='old'||r.id==='new'),[]).length,0)
})

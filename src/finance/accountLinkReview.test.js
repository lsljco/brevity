import test from 'node:test'
import assert from 'node:assert/strict'
import {accountLinkGroups} from './accountLinkReview.js'
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

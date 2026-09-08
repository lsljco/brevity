import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require=createRequire(import.meta.url)
const {createAccountSourceReceipt,verifyAccountSourceReceipt,mergeVerifiedPlaidBalances,RECEIPT_TTL_MS}=require('../../netlify/lib/plaid-account-source.cjs')
const secret='test-account-receipt-secret'
const issued=new Date('2026-09-07T16:00:00.000Z')
const source=[{accountId:'plaid-operating',itemId:'item-1',name:'Operating Account',officialName:'Primary Checking',type:'depository',subtype:'checking',mask:'607',balance:756.74,availableBalance:815.82,institution:'Pinnacle'}]

test('server-issued Plaid account receipts verify an exact bounded snapshot',()=>{
  const receipt=createAccountSourceReceipt(source,{signingSecret:secret,now:()=>issued,receiptHouseholdId:'household'})
  const verified=verifyAccountSourceReceipt(receipt,{signingSecret:secret,now:()=>new Date(issued.getTime()+1000),receiptHouseholdId:'household'})
  assert.deepEqual(verified,source)
  assert.throws(()=>verifyAccountSourceReceipt({...receipt,signature:'0'.repeat(64)},{signingSecret:secret,now:()=>issued,receiptHouseholdId:'household'}),error=>error.code==='PLAID_ACCOUNT_RECEIPT_MISMATCH')
  assert.throws(()=>verifyAccountSourceReceipt(receipt,{signingSecret:secret,now:()=>new Date(issued.getTime()+RECEIPT_TTL_MS+1),receiptHouseholdId:'household'}),error=>error.code==='PLAID_ACCOUNT_RECEIPT_MISMATCH')
})

test('verified account snapshots update only matched source-owned fields',()=>{
  const finance={accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:1,notes:'household truth'}],transactions:[{id:'mortgage'}]}
  const next=mergeVerifiedPlaidBalances(finance,source)
  assert.equal(next.accounts[0].balance,756.74)
  assert.equal(next.accounts[0].plaidAccountId,'plaid-operating')
  assert.equal(next.accounts[0].notes,'household truth')
  assert.deepEqual(next.transactions,finance.transactions)
})

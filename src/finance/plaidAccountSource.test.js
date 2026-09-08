import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'
import { buildPlaidBalanceSourceResult } from './financeRefresh.js'

const require=createRequire(import.meta.url)
const {createAccountSourceReceipt,verifyAccountSourceReceipt,mergeVerifiedPlaidBalances,normalizePlaidAccountBalances,RECEIPT_TTL_MS,LIVE_BALANCE_MODE,LIVE_BALANCE_PROVENANCE}=require('../../netlify/lib/plaid-account-source.cjs')
const {validatePlaidFinanceUpdate}=require('../../netlify/functions/household-state.js')
const secret='test-account-receipt-secret'
const issued=new Date('2026-09-07T16:00:00.000Z')
const source=[{accountId:'plaid-operating',itemId:'item-1',name:'Operating Account',officialName:'Primary Checking',type:'depository',subtype:'checking',mask:'607',balance:756.74,availableBalance:815.82,institution:'Pinnacle'}]

test('server-issued Plaid account receipts verify an exact bounded snapshot',()=>{
  const receipt=createAccountSourceReceipt(source,{signingSecret:secret,now:()=>issued,receiptHouseholdId:'household'})
  const verified=verifyAccountSourceReceipt(receipt,{signingSecret:secret,now:()=>new Date(issued.getTime()+1000),receiptHouseholdId:'household'})
  assert.deepEqual(verified.accounts,source)
  assert.equal(verified.issuedAt,issued.getTime())
  assert.match(verified.receiptId,/^[a-f0-9]{64}$/)
  assert.equal(verified.balanceMode,LIVE_BALANCE_MODE)
  assert.equal(verified.balanceProvenance,LIVE_BALANCE_PROVENANCE)
  const decoded=JSON.parse(Buffer.from(receipt.payload,'base64url').toString('utf8'))
  assert.equal(decoded.balanceMode,'live')
  assert.equal(decoded.balanceProvenance,'plaid.accountsBalanceGet')
  assert.throws(()=>verifyAccountSourceReceipt({...receipt,signature:'0'.repeat(64)},{signingSecret:secret,now:()=>issued,receiptHouseholdId:'household'}),error=>error.code==='PLAID_ACCOUNT_RECEIPT_MISMATCH')
  assert.throws(()=>verifyAccountSourceReceipt(receipt,{signingSecret:secret,now:()=>new Date(issued.getTime()+RECEIPT_TTL_MS+1),receiptHouseholdId:'household'}),error=>error.code==='PLAID_ACCOUNT_RECEIPT_MISMATCH')

  const cachedPayload=Buffer.from(JSON.stringify({...decoded,balanceMode:'cached',balanceProvenance:'plaid.accountsGet'})).toString('base64url')
  const cachedReceipt={payload:cachedPayload,signature:createHmac('sha256',secret).update(cachedPayload).digest('hex')}
  assert.throws(()=>verifyAccountSourceReceipt(cachedReceipt,{signingSecret:secret,now:()=>issued,receiptHouseholdId:'household'}),error=>error.code==='PLAID_ACCOUNT_RECEIPT_MISMATCH')
})

test('the maximum validated Plaid snapshot verifies its own receipt at the escaped-text boundary',()=>{
  const escapedText='\0'.repeat(512)
  const maximumSnapshot=Array.from({length:100},(_,index)=>({
    accountId:`${String(index).padStart(3,'0')}${'\0'.repeat(509)}`,
    itemId:escapedText,
    name:escapedText,
    officialName:escapedText,
    type:escapedText,
    subtype:escapedText,
    mask:escapedText,
    institution:escapedText,
    balance:-1_000_000_000_000,
    currentBalance:1_000_000_000_000,
    availableBalance:-1_000_000_000_000,
  }))

  const receipt=createAccountSourceReceipt(maximumSnapshot,{
    signingSecret:secret,
    now:()=>issued,
    receiptHouseholdId:escapedText,
  })
  // This reproduces the former 250k verifier mismatch and exercises the
  // six-byte JSON escape expansion, rather than only the ordinary ASCII case.
  assert.ok(receipt.payload.length>3_000_000)
  const verified=verifyAccountSourceReceipt(receipt,{
    signingSecret:secret,
    now:()=>new Date(issued.getTime()+1000),
    receiptHouseholdId:escapedText,
  })
  assert.equal(verified.accounts.length,100)
  assert.equal(verified.accounts[99].accountId,maximumSnapshot[99].accountId)
  assert.equal(verified.accounts[99].institution,escapedText)

  assert.throws(
    ()=>verifyAccountSourceReceipt({payload:'A'.repeat(3_500_001),signature:'a'.repeat(64)},{signingSecret:secret,now:()=>issued}),
    error=>error.code==='PLAID_ACCOUNT_RECEIPT_INVALID',
  )
  assert.throws(
    ()=>createAccountSourceReceipt([{...source[0],unsupported:'x'.repeat(1_000_000)}],{signingSecret:secret,now:()=>issued}),
    error=>error.code==='PLAID_ACCOUNT_RECEIPT_INVALID',
  )
})

test('the real client balance candidate passes server schema and receipt parity validation',()=>{
  const existing={
    calendarDataVersion:5,
    accounts:[{
      id:'operating',name:'Operating Account',type:'checking',balance:425,
      householdNote:'Keep household-owned account details unchanged.',
    }],
    transactions:[{id:'mortgage',name:'Mortgage',type:'expense'}],
  }
  const liveAccounts=[{
    accountId:'plaid-operating',itemId:'item-1',name:'Operating Account',officialName:'Primary Checking',
    type:'depository',subtype:'checking',mask:'607',balance:756.74,currentBalance:780.12,
    availableBalance:756.74,institution:'Pinnacle',
  }]
  const storage={getItem:key=>key==='lslj_finance_v9' ? JSON.stringify(existing) : null}
  const {finance:candidate,diagnostics}=buildPlaidBalanceSourceResult(storage,liveAccounts)

  assert.equal(diagnostics.matchedCount,1)
  assert.equal(validatePlaidFinanceUpdate(candidate,existing),'')
  const receipt=createAccountSourceReceipt(liveAccounts,{signingSecret:secret,now:()=>issued,receiptHouseholdId:'household'})
  const verified=verifyAccountSourceReceipt(receipt,{signingSecret:secret,now:()=>new Date(issued.getTime()+1000),receiptHouseholdId:'household'})
  const exactServerCandidate=JSON.parse(JSON.stringify(mergeVerifiedPlaidBalances(existing,verified.accounts)))
  assert.deepEqual(candidate,exactServerCandidate)
})

test('verified account snapshots update only matched source-owned fields',()=>{
  const finance={accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:1,notes:'household truth'}],transactions:[{id:'mortgage'}]}
  const next=mergeVerifiedPlaidBalances(finance,source)
  assert.equal(next.accounts[0].balance,756.74)
  assert.equal(next.accounts[0].plaidAccountId,'plaid-operating')
  assert.equal(next.accounts[0].notes,'household truth')
  assert.deepEqual(next.transactions,finance.transactions)
})

test('Plaid balance normalization separates cash, ledger value, investment assets, and credit capacity',()=>{
  assert.deepEqual(normalizePlaidAccountBalances({type:'depository',balances:{current:1000,available:900}}),{balance:900,currentBalance:1000,availableBalance:900})
  assert.deepEqual(normalizePlaidAccountBalances({type:'depository',balances:{current:1000,available:null}}),{balance:1000,currentBalance:1000,availableBalance:null})
  assert.deepEqual(normalizePlaidAccountBalances({type:'investment',balances:{current:100000,available:2000}}),{balance:100000,currentBalance:100000,availableBalance:2000})
  assert.deepEqual(normalizePlaidAccountBalances({type:'credit',balances:{current:1000,available:9000}}),{balance:-1000,currentBalance:1000,availableBalance:9000})
  assert.throws(()=>normalizePlaidAccountBalances({type:'credit',balances:{current:null,available:9000}}),error=>error.code==='PLAID_ACCOUNT_BALANCE_INVALID')
})

test('server merge rejects ambiguous local identities and never guesses from type alone',()=>{
  const sourceChecking=[{accountId:'p1',name:'Unrelated Checking',type:'depository',subtype:'checking',balance:100}]
  const unlinked={accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:10}],transactions:[]}
  assert.equal(mergeVerifiedPlaidBalances(unlinked,sourceChecking).accounts[0].balance,10)
  assert.throws(()=>mergeVerifiedPlaidBalances({accounts:[
    {id:'a',name:'One',type:'checking',balance:10,plaidAccountId:'p1'},
    {id:'b',name:'Two',type:'checking',balance:20,plaidAccountId:'p1'},
  ],transactions:[]},sourceChecking),error=>error.code==='PLAID_ACCOUNT_LINKAGE_AMBIGUOUS')
  assert.throws(()=>mergeVerifiedPlaidBalances({accounts:[
    {id:'same',name:'One',type:'checking',balance:10},
    {id:'same',name:'Two',type:'checking',balance:20},
  ],transactions:[]},sourceChecking),error=>error.code==='PLAID_ACCOUNT_LINKAGE_AMBIGUOUS')
})

test('server merge rejects an existing Plaid ID whose financial type changed',()=>{
  const finance={accounts:[{
    id:'operating',name:'Operating Account',type:'checking',balance:425,
    plaidAccountId:'linked-source',
  }],transactions:[]}
  const sourceCredit=[{
    accountId:'linked-source',name:'Credit Card',type:'credit',subtype:'credit card',balance:-1875,
  }]

  assert.throws(
    ()=>mergeVerifiedPlaidBalances(finance,sourceCredit),
    error=>error.code==='PLAID_ACCOUNT_LINKAGE_INCOMPATIBLE' && /different financial type/i.test(error.message),
  )
  assert.equal(finance.accounts[0].balance,425)
})

test('server merge requires a valid Plaid type family even when the subtype looks compatible',()=>{
  const malformedSources=[
    {localType:'checking',plaidType:'credit',plaidSubtype:'checking'},
    {localType:'savings',plaidType:'credit',plaidSubtype:'savings'},
    {localType:'credit',plaidType:'depository',plaidSubtype:'credit card'},
    {localType:'investment',plaidType:'depository',plaidSubtype:'brokerage'},
  ]

  malformedSources.forEach(({localType,plaidType,plaidSubtype},index)=>{
    const sourceId=`source-${index}`
    const finance={accounts:[{
      id:`local-${index}`,
      name:`Account ${index}`,
      type:localType,
      balance:425,
      plaidAccountId:sourceId,
    }],transactions:[]}
    const malformed=[{
      accountId:sourceId,
      name:`Source ${index}`,
      type:plaidType,
      subtype:plaidSubtype,
      balance:999,
    }]

    assert.throws(
      ()=>mergeVerifiedPlaidBalances(finance,malformed),
      error=>error.code==='PLAID_ACCOUNT_LINKAGE_INCOMPATIBLE' && /different financial type/i.test(error.message),
    )
    assert.equal(finance.accounts[0].balance,425)
  })
})

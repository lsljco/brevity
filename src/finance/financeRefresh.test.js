import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchLatestPlaidTransactions, mergePlaidBalances, transactionSnapshotFingerprint } from './financeRefresh.js'

test('startup balance refresh updates existing accounts without creating duplicates', () => {
  const finance = { accounts:[
    { id:'a1', name:'Operating Account', type:'checking', balance:10 },
    { id:'a2', name:'Family Savings', type:'savings', balance:20 },
  ], transactions:[{ id:'keep-me' }] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId:'plaid-1', name:'Operating Account', subtype:'checking', balance:1500 },
    { accountId:'plaid-2', name:'Family Savings', subtype:'savings', balance:2200 },
    { accountId:'plaid-extra', name:'Do Not Create', subtype:'checking', balance:999 },
  ])
  assert.deepEqual(refreshed.accounts.map(account=>[account.id,account.balance,account.plaidAccountId]), [
    ['a1',1500,'plaid-1'],
    ['a2',2200,'plaid-2'],
  ])
  assert.equal(refreshed.transactions[0].id, 'keep-me')
})

test('does not guess between ambiguous Plaid accounts using only a broad type', () => {
  const finance = { accounts: [{ id: 'operating', name: 'Operating Account', type: 'checking', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Primary Checking', type: 'depository', subtype: 'checking', balance: 100 },
    { accountId: 'checking-2', name: 'Secondary Checking', type: 'depository', subtype: 'checking', balance: 200 },
  ])
  assert.equal(refreshed.accounts[0].balance, 10)
  assert.equal(refreshed.accounts[0].plaidAccountId, undefined)
})

test('uses a single compatible type fallback only when the mapping is unambiguous', () => {
  const finance = { accounts: [{ id: 'operating', name: 'Operating Account', type: 'checking', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Bank Account', type: 'depository', subtype: 'checking', balance: 100 },
  ])
  assert.equal(refreshed.accounts[0].balance, 100)
  assert.equal(refreshed.accounts[0].plaidAccountId, 'checking-1')
})

test('does not link an exact account name when the financial account types conflict', () => {
  const finance = { accounts: [{ id: 'savings', name: 'Primary Account', type: 'savings', balance: 10 }], transactions: [] }
  const refreshed = mergePlaidBalances(finance, [
    { accountId: 'checking-1', name: 'Primary Account', type: 'depository', subtype: 'checking', balance: 100 },
  ])
  assert.equal(refreshed.accounts[0].balance, 10)
  assert.equal(refreshed.accounts[0].plaidAccountId, undefined)
})

test('transaction snapshot fingerprint detects new pending transactions', () => {
  const before = [{ id:'apple', date:'2026-09-06', amount:49.98, pending:true }]
  const after = [...before, { id:'groceries', date:'2026-09-06', amount:150.12, pending:true }]
  assert.notEqual(transactionSnapshotFingerprint(before), transactionSnapshotFingerprint(after))
})

test('on-demand transaction refresh polls until Plaid exposes a changed snapshot', async () => {
  const calls=[]
  const payloads=[
    {transactions:[],refresh:{requested:true,accepted:1,errors:[]}},
    {transactions:[{id:'old',amount:10,pending:true}]},
    {transactions:[{id:'old',amount:10,pending:true}]},
    {transactions:[{id:'old',amount:10,pending:true},{id:'new',amount:48.32,pending:true}]},
  ]
  const result=await fetchLatestPlaidTransactions({
    requestBankUpdate:true,
    fetcher:async path=>{calls.push(path);return payloads.shift()},
    wait:async()=>{},
    retryDelays:[1,1],
  })
  assert.match(calls[0],/refresh=1&refresh_only=1/)
  assert.equal(calls.length,4)
  assert.equal(result.transactions.length,2)
  assert.equal(result.refresh.updated,true)
  assert.equal(result.refresh.stillProcessing,false)
})

test('on-demand transaction refresh reports when Plaid is still processing', async () => {
  const snapshot={transactions:[{id:'same',amount:10,pending:true}]}
  const result=await fetchLatestPlaidTransactions({
    requestBankUpdate:true,
    fetcher:async path=>path.includes('refresh_only=1')?{transactions:[],refresh:{requested:true,accepted:1,errors:[]}}:snapshot,
    wait:async()=>{},
    retryDelays:[1],
  })
  assert.equal(result.refresh.updated,false)
  assert.equal(result.refresh.stillProcessing,true)
})

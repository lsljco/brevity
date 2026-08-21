import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePlaidBalances } from './financeRefresh.js'

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

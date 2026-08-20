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

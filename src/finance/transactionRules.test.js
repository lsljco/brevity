import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTransactionRules, transactionMatchesRule } from './transactionRules.js'

const rule = {
  createdDate: '2026-08-01',
  applyToExisting: true,
  conditions: {
    merchantName: { on: true, match: 'contains', value: 'market' },
    amount: { on: true, min: '10', max: '100' },
    accounts: { on: true, value: 'operating' },
  },
  actions: {
    renameMerchant: { on: true, value: 'Neighborhood Market' },
    updateCategory: { on: true, value: 'Groceries' },
    addTags: { on: true, value: 'food, household' },
  },
}

test('saved transaction rules match Plaid accounts and apply their actions', () => {
  const tx = { id: 'tx1', accountId: 'plaid-1', date: '2026-08-20', name: 'THE MARKET #2', amount: 54 }
  const accounts = [{ id: 'operating', plaidAccountId: 'plaid-1' }]
  assert.equal(transactionMatchesRule(tx, rule, accounts), true)
  assert.deepEqual(applyTransactionRules(tx, [rule], accounts), {
    ...tx,
    name: 'Neighborhood Market',
    category: 'Groceries',
    tags: ['food', 'household'],
  })
})

test('future-only rules leave older transactions unchanged', () => {
  const futureOnly = { ...rule, applyToExisting: false, createdDate: '2026-08-21' }
  const tx = { id: 'old', accountId: 'plaid-1', date: '2026-08-20', name: 'Market', amount: 20 }
  assert.equal(applyTransactionRules(tx, [futureOnly], [{ id: 'operating', plaidAccountId: 'plaid-1' }]), tx)
})

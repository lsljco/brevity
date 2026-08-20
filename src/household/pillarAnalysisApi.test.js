import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPillarContextFromStorage } from './pillarAnalysisApi.js'

function storage(values) {
  return { getItem: key => values[key] ?? null }
}

test('finance analysis reads the active finance, Plaid and budget storage keys', () => {
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9: JSON.stringify({ accounts:[{ id:'a1', balance:1250 }], transactions:[{ id:'scheduled' }] }),
    plaid_actuals_cache: JSON.stringify([{ id:'posted', amount:42 }]),
    lslj_budget_v1: JSON.stringify({ Groceries:[300] }),
    plaid_synced_at: '2026-08-20T22:00:00.000Z',
  }))
  assert.equal(context.accounts[0].balance, 1250)
  assert.equal(context.scheduledTransactions[0].id, 'scheduled')
  assert.equal(context.actualTransactions[0].id, 'posted')
  assert.deepEqual(context.budgets.Groceries, [300])
  assert.equal(context.syncedAt, '2026-08-20T22:00:00.000Z')
})

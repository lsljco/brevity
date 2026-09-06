import test from 'node:test'
import assert from 'node:assert/strict'
import { clearPillarAnalyses, collectPillarContextFromStorage, PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisStorageKey, readPillarAnalysis } from './pillarAnalysisApi.js'

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

test('clearing a changed daily plan invalidates every pillar analysis for that date', () => {
  const removed = []
  clearPillarAnalyses('2026-08-21', { removeItem: key => removed.push(key) })
  assert.equal(removed.length, 7)
  assert.ok(removed.includes(pillarAnalysisStorageKey('2026-08-21', 'finance')))
  assert.ok(removed.includes(pillarAnalysisStorageKey('2026-08-21', 'spiritual')))
  assert.ok(removed.every(key => key.includes('2026-08-21')))
})

test('pillar analysis cache only reads the current insight schema', () => {
  const date = '2026-09-06'
  const pillar = 'spiritual'
  const key = pillarAnalysisStorageKey(date, pillar)
  assert.match(key, new RegExp(`_v${PILLAR_ANALYSIS_SCHEMA_VERSION}_`))
  assert.equal(readPillarAnalysis(date, pillar, storage({ [key]: JSON.stringify({ schemaVersion:1, analysis:{} }) })), null)
  const current = { schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION, analysis:{ headline:'Growth' } }
  assert.deepEqual(readPillarAnalysis(date, pillar, storage({ [key]: JSON.stringify(current) })), current)
})

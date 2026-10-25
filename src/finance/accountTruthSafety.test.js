import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const planner = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

test('account balances and household account structure have no manual mutation controls', () => {
  for (const unsafeControl of [
    'function AcctForm',
    "view === 'acct-form'",
    'const updateAcct',
    'const deleteAcct',
    'saveBalanceOverride',
    'removeBalanceOverride',
    'setEditBal',
    'commitBal',
    'Add account',
    'Reset to projected',
    'Click to set actual balance',
  ]) assert.equal(planner.includes(unsafeControl), false, `${unsafeControl} must remain unavailable`)

  assert.match(planner, /Brevity never guesses when bank names differ/)
  assert.match(planner, /reviewed link does not move money or change credentials/)
  assert.match(planner, /type:'finance\.account\.link'/)
  assert.match(planner, /payload:\{ plaidAccountId \}/)
  assert.match(planner, /title="Estimated end-of-day balance from dated bank observations and posted history"/)
  assert.match(planner, /Reconstructed end-of-day balance/)
  assert.doesNotMatch(planner, /Actual ending balance from bank/)
  assert.match(planner, /`Projected from \$\{balanceSource\}`/)
  assert.match(planner, /const proj = cashForecastProjection/)
})

test('legacy balance override state cannot alter Finance projections', () => {
  assert.equal(planner.includes('lslj_bal_overrides_v1'), false)
  assert.equal(planner.includes('balanceOverrides'), false)
  assert.equal(planner.includes('setBalanceOverrides'), false)
})

test('recovery exports cannot reintroduce retired manual balance overrides', () => {
  const backupListStart=app.indexOf('const backupKeys=')
  const exportStart=app.indexOf('const handleExport=',backupListStart)
  assert.ok(backupListStart>=0&&exportStart>backupListStart)
  assert.equal(app.slice(backupListStart,exportStart).includes('lslj_bal_overrides_v1'),false)
})

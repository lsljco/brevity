import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const planner = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

test('account identity and bank balances have no manual mutation controls', () => {
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

  assert.match(planner, /Account identity, type, and current balance are source-managed/)
  assert.match(planner, /does not allow manual account creation, renaming, type changes, balance overrides, or deletion/)
  assert.match(planner, /title="Reconstructed end-of-day balance from the latest bank balance and transaction history"/)
  assert.match(planner, /Reconstructed end-of-day balance/)
  assert.doesNotMatch(planner, /Actual ending balance from bank/)
  assert.match(planner, /`Projected from \$\{balanceSource\}`/)
  assert.match(planner, /Manual balance overrides are intentionally ignored/)
  assert.match(planner, /buildProjection\(fd\.accounts, fd\.transactions, 365, \{\}, 365, todayAnchor\)/)
})

test('legacy balance override state cannot alter Finance projections', () => {
  const projectionStart = planner.indexOf('const proj = useMemo')
  const actualsStart = planner.indexOf('// ── Actuals', projectionStart)
  const projectionBlock = planner.slice(projectionStart, actualsStart)
  assert.ok(projectionStart >= 0 && actualsStart > projectionStart)
  assert.equal(projectionBlock.includes('lslj_bal_overrides_v1'), false)
  assert.equal(projectionBlock.includes('balanceOverrides'), false)
  assert.equal(planner.includes('setBalanceOverrides'), false)
})

test('recovery exports cannot reintroduce retired manual balance overrides', () => {
  const backupListStart=app.indexOf('const backupKeys=')
  const exportStart=app.indexOf('const handleExport=',backupListStart)
  assert.ok(backupListStart>=0&&exportStart>backupListStart)
  assert.equal(app.slice(backupListStart,exportStart).includes('lslj_bal_overrides_v1'),false)
})

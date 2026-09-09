import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const planner = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')
const actualTransaction = readFileSync(new URL('./ActualTxModal.jsx', import.meta.url), 'utf8')
const transactionRule = readFileSync(new URL('./TransactionRuleModal.jsx', import.meta.url), 'utf8')
const meetings = readFileSync(new URL('./FinanceMeetingsWorkspace.jsx', import.meta.url), 'utf8')
const metricDrilldown = readFileSync(new URL('./MetricDrilldown.jsx', import.meta.url), 'utf8')

test('finance navigation and dialog icon controls expose explicit accessible names', () => {
  for (const label of [
    'Back from transaction form',
    'Previous dashboard calendar month',
    'Next dashboard calendar month',
    'Close financial insight',
    'Close transaction editor',
    'Previous budget month',
    'Next budget month',
    'Previous report year',
    'Next report year',
    'Close category details',
    'Previous financial calendar month',
    'Next financial calendar month',
  ]) assert.match(planner, new RegExp(`aria-label="${label}"`))

  assert.ok(planner.includes('aria-label={`Edit ${tx.name}`}'))
  assert.ok(planner.includes('aria-label={`Delete ${tx.name}`}'))
  assert.equal(planner.includes('aria-label={`Edit ${acct.name} account`}'), false)
  assert.equal(planner.includes('aria-label={`Delete ${acct.name} account`}'), false)
  assert.ok(planner.includes('aria-label={`Bank source for ${acct.name}`}'))
})

test('actual transaction and legacy rule controls describe close, remove, and toggle actions', () => {
  assert.match(actualTransaction, /aria-label="Close rule editor"/)
  assert.match(actualTransaction, /aria-label="Close transaction details"/)
  assert.ok(actualTransaction.includes("aria-label={`${src[k].on ? 'Disable' : 'Enable'} ${label}`}"))
  assert.ok(actualTransaction.includes('aria-pressed={src[k].on}'))
  assert.ok(actualTransaction.includes('aria-label={`Remove rule split ${i + 1}`}'))
})

test('actual bank facts stay immutable and only Name and Category enter reviewed Action Mode', () => {
  const saveStart = actualTransaction.lastIndexOf('const handleSave = async () =>')
  const saveEnd = actualTransaction.indexOf('// Find local account', saveStart)
  const saveBlock = actualTransaction.slice(saveStart, saveEnd)
  assert.ok(saveStart >= 0 && saveEnd > saveStart)
  assert.match(saveBlock, /name: form\.name\.trim\(\)/)
  assert.match(saveBlock, /category: form\.category\.trim\(\)/)
  for (const bankOrUnsupportedField of ['form.amount', 'form.date', 'form.originalStatement', 'form.notes', 'form.goal', 'form.splits', 'attachments']) {
    assert.equal(saveBlock.includes(bankOrUnsupportedField), false)
  }
  assert.match(actualTransaction, /value=\{form\.originalStatement\}[\s\S]{0,80}readOnly/)
  assert.match(actualTransaction, /type="date" value=\{form\.date\} readOnly/)
  assert.match(actualTransaction, /value=\{form\.amount\} readOnly/)
  assert.match(actualTransaction, /value=\{form\.goal\} disabled/)
  assert.match(actualTransaction, /value=\{form\.notes\} readOnly/)
  assert.match(actualTransaction, /value=\{form\.needsReview\} disabled/)
  assert.match(actualTransaction, /Bank Transaction Cannot Be Deleted/)
  assert.match(actualTransaction, /Save this category change as a rule\?/)
  assert.match(actualTransaction, /Yes, set up rule/)
  assert.match(actualTransaction, /No, just this transaction/)
  assert.match(transactionRule, /Apply this rule to all past matching transactions/)
  assert.match(transactionRule, /Match method/)
  assert.equal(actualTransaction.includes('<CategoryToast'), false)
  assert.equal(actualTransaction.includes('<RuleModal'), false)

  const handlerStart = planner.indexOf('const handleSaveActualTx = async')
  const handlerEnd = planner.indexOf('const updateAcct', handlerStart)
  const handler = planner.slice(handlerStart, handlerEnd)
  assert.match(handler, /prepareDirectAction\(/)
  assert.match(handler, /type:'transaction\.update'/)
  assert.match(handler, /getAcknowledgedSharedStateVersion\(localStorage,'lslj_tx_overrides_v1'\)/)
  assert.match(handler, /requestActionReview\(result\.proposal\)/)
  assert.equal(handler.includes('persistAuxiliaryValue'), false)
  assert.equal(handler.includes('setTxOverrides'), false)
})

test('meeting and metric drilldown icon controls have contextual names', () => {
  assert.ok(meetings.includes("aria-label={`${item.status==='done'?'Reopen':'Complete'} commitment: ${display.text}`}"))
  assert.match(meetings, /aria-label="Dismiss command notice"/)
  assert.ok(metricDrilldown.includes("aria-label={stack.length>1?'Back to previous breakdown':'Close breakdown'}"))
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const accountsFunction=readFileSync(new URL('../../netlify/functions/plaid-accounts.js',import.meta.url),'utf8')
const transactionsFunction=readFileSync(new URL('../../netlify/functions/plaid-transactions.js',import.meta.url),'utf8')
const plaidConnect=readFileSync(new URL('./PlaidConnect.jsx',import.meta.url),'utf8')
const financePlanner=readFileSync(new URL('./FinancePlanner.jsx',import.meta.url),'utf8')
const financeRefresh=readFileSync(new URL('./financeRefresh.js',import.meta.url),'utf8')

test('automatic account refresh is cached while Sync now explicitly requests live balances',()=>{
  assert.match(accountsFunction,/liveBalance\s*\?\s*await plaidClient\.accountsBalanceGet/)
  assert.match(accountsFunction,/:\s*await plaidClient\.accountsGet/)
  assert.match(plaidConnect,/apiFetch\('\/plaid-accounts\?live=1'\)/)
  assert.match(plaidConnect,/onTransactionsSync/)
  assert.match(plaidConnect,/refreshTransactions:true/)
  assert.match(plaidConnect,/Balances checked/)
  assert.match(plaidConnect,/REQUEST_TIMEOUT_MS\s*=\s*45000/)
  assert.match(plaidConnect,/No bank connected — source-managed balances unavailable/)
  assert.doesNotMatch(plaidConnect,/balances are manual/i)
})

test('Finance mount does not duplicate the shared application transaction refresh',()=>{
  assert.doesNotMatch(financePlanner,/useEffect\(\(\)\s*=>\s*\{\s*fetchActuals\(\)\s*\}/)
  assert.match(financePlanner,/FINANCE_REFRESH_EVENT/)
})

test('explicit transaction refresh requests a Plaid institution update without blocking cached reads',()=>{
  assert.match(transactionsFunction,/params\.get\('refresh'\) === '1'/)
  assert.match(transactionsFunction,/plaidClient\.transactionsRefresh/)
  assert.match(transactionsFunction,/transactionsSync/)
  assert.doesNotMatch(transactionsFunction,/transactionsGet/)
  assert.doesNotMatch(financeRefresh,/start_date=2000-01-01/)
  assert.match(transactionsFunction,/refreshOnly/)
  assert.match(financeRefresh,/stillProcessing:true/)
  assert.match(financePlanner,/Refresh bank data/)
})

test('manual Finance refresh preserves failed-institution history and discloses partial results',()=>{
  assert.match(financePlanner,/mergePlaidTransactionResponse\(plaidActuals \|\| \[\], json\)/)
  assert.match(financePlanner,/const syncErrors = json\.errors \|\| \[\]/)
  assert.match(financePlanner,/last-known transactions were retained/)
  assert.match(financePlanner,/await persistSharedSourceImport\(localStorage, PLAID_ACTUALS_KEY, txns, \{ sourceReceipts:json\.sourceReceipts \}\)[\s\S]*setPlaidActuals\(txns\)/)
  assert.doesNotMatch(financePlanner,/localStorage\.setItem\(['"]plaid_actuals_cache['"], JSON\.stringify\(txns\)\)/)
})

test('Plaid balance success waits for versioned household persistence',()=>{
  assert.match(financePlanner,/const handlePlaidSync = useCallback\(async \(plaidAccounts, syncedAt, accountSourceReceipt\)/)
  assert.match(financePlanner,/await persistSharedSourceImport\(localStorage, LS_KEY, next, \{ accountSourceReceipt \}\)[\s\S]*setData\(next\)[\s\S]*Balances synced from Plaid/)
  assert.match(plaidConnect,/await onAccountsSync\(data\.accounts, data\.syncedAt, data\.accountSourceReceipt\)[\s\S]*balanceResult\?\.ok !== true[\s\S]*setSyncedAt\(data\.syncedAt\)/)
  assert.match(plaidConnect,/localStorage\.setItem\('plaid_synced_at', data\.syncedAt\)[\s\S]*setSyncedAt\(data\.syncedAt\)/)
  assert.match(plaidConnect,/Bank balances were received but could not be saved safely/)
  assert.match(plaidConnect,/Bank balances were saved, but connection status could not be cached/)
  assert.match(plaidConnect,/transaction view is marked partial/)
  assert.doesNotMatch(financePlanner,/useEffect\(\(\) => \{\s*if \(readOnly\) return\s*const result = saveData\(data\)/)
})

test('dashboard bank controls wrap safely at phone width',()=>{
  assert.match(plaidConnect,/className="plaid-connect"/)
  assert.match(plaidConnect,/className="plaid-connect-disconnected"/)
  assert.match(financePlanner,/\.dash-actions \.plaid-connect[\s\S]*margin-bottom: 0 !important/)
  assert.match(financePlanner,/@media \(max-width: 768px\)[\s\S]*\.plaid-connect-disconnected \{ flex-wrap: wrap !important/)
})

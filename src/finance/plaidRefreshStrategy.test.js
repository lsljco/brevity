import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const accountsFunction=readFileSync(new URL('../../netlify/functions/plaid-accounts.js',import.meta.url),'utf8')
const plaidConnect=readFileSync(new URL('./PlaidConnect.jsx',import.meta.url),'utf8')
const financePlanner=readFileSync(new URL('./FinancePlanner.jsx',import.meta.url),'utf8')

test('automatic account refresh is cached while Sync now explicitly requests live balances',()=>{
  assert.match(accountsFunction,/liveBalance\s*\?\s*await plaidClient\.accountsBalanceGet/)
  assert.match(accountsFunction,/:\s*await plaidClient\.accountsGet/)
  assert.match(plaidConnect,/apiFetch\('\/plaid-accounts\?live=1'\)/)
  assert.match(plaidConnect,/REQUEST_TIMEOUT_MS\s*=\s*45000/)
})

test('Finance mount does not duplicate the shared application transaction refresh',()=>{
  assert.doesNotMatch(financePlanner,/useEffect\(\(\)\s*=>\s*\{\s*fetchActuals\(\)\s*\}/)
  assert.match(financePlanner,/FINANCE_REFRESH_EVENT/)
})

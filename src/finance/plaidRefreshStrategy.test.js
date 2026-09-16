import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const accountsFunction=readFileSync(new URL('../../netlify/functions/plaid-accounts.js',import.meta.url),'utf8')
const transactionsFunction=readFileSync(new URL('../../netlify/functions/plaid-transactions.js',import.meta.url),'utf8')
const plaidConnect=readFileSync(new URL('./PlaidConnect.jsx',import.meta.url),'utf8')
const financePlanner=readFileSync(new URL('./FinancePlanner.jsx',import.meta.url),'utf8')

test('Accounts mirrors the application-wide Plaid refresh state',()=>{
  assert.match(plaidConnect,/APP_REFRESH_STARTED_EVENT/)
  assert.match(plaidConnect,/event\.detail\?\.bankUpdateRequested[\s\S]*setSyncing\(true\)/)
  assert.match(plaidConnect,/APP_REFRESH_EVENT[\s\S]*setSyncing\(false\)/)
  assert.match(plaidConnect,/syncing \? 'Syncing…' : 'Sync now'/)
})
const financeRefresh=readFileSync(new URL('./financeRefresh.js',import.meta.url),'utf8')

test('automatic account refresh is cached while Sync now explicitly requests live balances',()=>{
  assert.match(accountsFunction,/LIVE_BALANCE_TIMEOUT_MS\s*=\s*30000/)
  assert.match(accountsFunction,/accountsBalanceGet\(\{ access_token \}, \{ timeout:LIVE_BALANCE_TIMEOUT_MS \}\)/)
  assert.match(accountsFunction,/accountsGet\(\{ access_token \}, \{ timeout:CACHED_ACCOUNT_TIMEOUT_MS \}\)/)
  assert.match(accountsFunction,/liveBalance && !liveBalanceTimedOut \? \{ accountSourceReceipt:createAccountSourceReceipt\(allAccounts\) \} : \{\}/)
  assert.match(accountsFunction,/balanceProvenance = liveBalance && !liveBalanceTimedOut \? LIVE_BALANCE_PROVENANCE : 'plaid\.accountsGet'/)
  assert.match(financeRefresh,/requestLiveBalances \? '\/plaid-accounts\?live=1' : '\/plaid-accounts'/)
  assert.match(financeRefresh,/LIVE_BALANCE_REQUEST_TIMEOUT_MS\s*=\s*45000/)
  assert.match(financeRefresh,/timeoutMs:requestLiveBalances \? LIVE_BALANCE_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS/)
  assert.match(financeRefresh,/fetchAccounts\(\{ requestBankUpdate \}\)/)
  assert.match(plaidConnect,/apiFetch\('\/plaid-accounts\?live=1'\)/)
  assert.match(plaidConnect,/onTransactionsSync/)
  assert.match(plaidConnect,/refreshTransactions:true/)
  assert.match(plaidConnect,/Balances checked/)
  assert.match(plaidConnect,/REQUEST_TIMEOUT_MS\s*=\s*45000/)
  assert.match(plaidConnect,/if \(data\.liveBalanceTimedOut\)/)
  assert.match(plaidConnect,/transaction refresh continues separately/)
  assert.match(plaidConnect,/\[balanceHasIssue \? '' : balanceSummary, transactionSummary\]/)
  assert.match(plaidConnect,/No cached bank connection on this device/)
  assert.match(plaidConnect,/Check existing connection/)
  assert.match(plaidConnect,/Checks for an existing server-managed bank connection without adding or changing one/)
  assert.match(plaidConnect,/onClick=\{\(\) => syncAccounts\(\{ refreshTransactions:true \}\)\}/)
  assert.match(plaidConnect,/Bank changes unavailable/)
  assert.doesNotMatch(plaidConnect,/balances are manual/i)
})

test('Finance mount does not duplicate the shared application transaction refresh',()=>{
  assert.doesNotMatch(financePlanner,/useEffect\(\(\)\s*=>\s*\{\s*fetchActuals\(\)\s*\}/)
  assert.match(financePlanner,/FINANCE_REFRESH_EVENT/)
  assert.match(financePlanner,/useState\(\(\) => readLatestBalanceRefreshStatus\(\)\.status\)/)
  assert.match(financePlanner,/useState\(\(\) => readLatestBalanceRefreshStatus\(\)\.errors\)/)
  assert.match(financePlanner,/\['ambiguous','incompatible','unmatched','unverified'\]\.includes\(balanceDataStatus\)/)
})

test('an open Finance screen revalidates aged claims and remote balance snapshots',()=>{
  assert.match(financePlanner,/const revalidateFreshness = \(\) => \{[\s\S]*readTransactionFreshness\(localStorage\)[\s\S]*readLatestBalanceRefreshStatus\(\)/)
  assert.match(financePlanner,/setInterval\(revalidateFreshness, 60_000\)/)
  assert.match(financePlanner,/addEventListener\('visibilitychange', revalidateWhenVisible\)/)
  assert.match(financePlanner,/addEventListener\('focus', revalidateFreshness\)/)
  assert.match(financePlanner,/keys\.has\('lslj_finance_v9'\)[\s\S]*invalidateLatestBalanceRefreshStatus\(\)/)
  assert.match(financePlanner,/recordLatestBalanceRefreshStatus\(\{/)
})

test('explicit transaction refresh requests a Plaid institution update without blocking cached reads',()=>{
  assert.match(transactionsFunction,/params\.get\('refresh'\) === '1'/)
  assert.match(transactionsFunction,/plaidClient\.transactionsRefresh/)
  assert.match(transactionsFunction,/transactionsSync/)
  assert.doesNotMatch(transactionsFunction,/transactionsGet/)
  assert.doesNotMatch(financeRefresh,/start_date=2000-01-01/)
  assert.match(transactionsFunction,/refreshOnly/)
  assert.match(financeRefresh,/stillProcessing:true/)
  assert.match(transactionsFunction,/refresh_status/)
  assert.match(transactionsFunction,/last_successful_update/)
  assert.match(financeRefresh,/waitForPlaidTransactionRefresh/)
  assert.match(financePlanner,/Brevity is waiting for the bank to confirm completion/)
  assert.match(plaidConnect,/const transactionHasIssue = \['failed','partial'\]\.includes\(transactionState\)/)
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
  assert.match(financePlanner,/const handlePlaidSync = useCallback\(async \(plaidAccounts, syncedAt, accountSourceReceipt, sourceErrors = \[\]\)/)
  assert.match(financePlanner,/buildPlaidBalanceSourceResult\(localStorage, plaidAccounts, LS_KEY\)[\s\S]*missingLinkedCount[\s\S]*await persistSharedSourceImport\(localStorage, LS_KEY, next, \{ accountSourceReceipt \}\)[\s\S]*const current = loadData\(\)[\s\S]*setData\(current\)[\s\S]*synced from Plaid/)
  assert.doesNotMatch(financePlanner,/const next = mergePlaidBalances\(dataRef\.current, plaidAccounts\)/)
  assert.match(plaidConnect,/await onAccountsSync\(plaidAccounts, data\.syncedAt, data\.accountSourceReceipt, balanceAttemptErrors\)[\s\S]*balanceResult\?\.ok !== true[\s\S]*cacheCompleteConnectionSnapshot\(localStorage, conns, data\.syncedAt\)[\s\S]*setSyncedAt\(data\.syncedAt\)/)
  assert.match(plaidConnect,/Bank balances were received but could not be saved safely/)
  assert.match(plaidConnect,/Bank balances were saved, but connection status could not be cached/)
  assert.match(plaidConnect,/Transaction refresh is partial/)
  assert.match(plaidConnect,/balancePartial/)
  assert.match(plaidConnect,/previously linked Brevity account/)
  assert.match(plaidConnect,/Prior connection details and the last complete balance-check time are unchanged/)
  assert.match(plaidConnect,/last complete time was preserved/)
  assert.doesNotMatch(plaidConnect,/Balances are current/)
  assert.match(plaidConnect,/balanceState === 'complete' && \['complete','skipped'\]\.includes\(transactionState\)[\s\S]*brevity-finance-sync-recovered/)
  assert.doesNotMatch(financePlanner,/useEffect\(\(\) => \{\s*if \(readOnly\) return\s*const result = saveData\(data\)/)
})

test('unmatched returned accounts lead to a reviewed bank-source mapping instead of a dead-end warning',()=>{
  assert.match(plaidConnect,/setLinkReviewCount\(balanceResult\?\.linkReviewAvailable \? unmatchedCount : 0\)/)
  assert.match(plaidConnect,/Review account links/)
  assert.match(plaidConnect,/onReviewAccountLinks/)
  assert.match(financePlanner,/setPlaidAccountCandidates\(returnedAccounts\)/)
  assert.match(financePlanner,/compatiblePlaidAccountType\(acct, source\)/)
  assert.match(financePlanner,/Verified bank source/)
  assert.match(financePlanner,/type:'finance\.account\.link'/)
  assert.match(financePlanner,/payload:\{ plaidAccountId \}/)
  assert.match(financePlanner,/getAcknowledgedSharedStateVersion\(localStorage, LS_KEY\)/)
  assert.match(financePlanner,/requestActionReview\(result\.proposal\)/)
  assert.match(financePlanner,/does not move money or change bank credentials/)
})

test('extra returned bank accounts do not downgrade a complete linked-account refresh',()=>{
  assert.match(financePlanner,/classifyPlaidBalanceGaps\(diagnostics\)/)
  assert.match(financePlanner,/const partial = missingLinkedCount > 0 \|\| sourceErrors\.length > 0/)
  assert.match(financePlanner,/untracked bank account.*safely ignored/)
  assert.match(plaidConnect,/balanceResult\?\.linkReviewAvailable && unmatchedCount/)
  assert.match(financePlanner,/All \$\{data\.accounts\.length\} Brevity accounts are linked to verified bank sources/)
  assert.match(financePlanner,/additional accounts returned by the institution remain safely untracked/)
})

test('a failed balance write cannot suppress the independently requested transaction refresh',()=>{
  const syncHandler=plaidConnect.match(/const syncAccounts = useCallback\(async[\s\S]*?\n  \}, \[onAccountsSync, onTransactionsSync\]\)/)?.[0] || ''
  assert.ok(syncHandler)
  assert.match(syncHandler,/try \{[\s\S]*await onAccountsSync[\s\S]*balanceFailure = cause\?\.message[\s\S]*Transactions are an independent requested source refresh[\s\S]*await onTransactionsSync\(\)/)
  assert.match(syncHandler,/Bank balances were received but could not be saved safely/)
  assert.match(syncHandler,/Transaction refresh did not complete/)
  assert.match(syncHandler,/setError\(\[balanceHasIssue \? balanceDetail : '', transactionHasIssue \? transactionDetail : ''\]/)
  assert.match(syncHandler,/Balances were not changed/)
  assert.match(syncHandler,/The latest available transactions were checked/)
})

test('manual balance non-results revoke a prior fresh claim without suppressing transaction refresh',async()=>{
  const helperSource=plaidConnect.match(/async function reportUnverifiedBalanceAttempt\([\s\S]*?\n\}/)?.[0] || ''
  assert.ok(helperSource)
  const reportAttempt=new Function(`${helperSource}; return reportUnverifiedBalanceAttempt`)()
  let reportedArgs=null
  const result=await reportAttempt(async (...args)=>{
    reportedArgs=args
    return { ok:false }
  },{
    status:'disconnected',
    message:'No existing server bank connection was found.',
    checkedAt:'2026-09-08T12:00:00.000Z',
  })
  assert.deepEqual(result,{ ok:false })
  assert.deepEqual(reportedArgs,[
    [],
    '2026-09-08T12:00:00.000Z',
    null,
    [{
      institution:'Plaid',
      code:'BALANCE_DISCONNECTED',
      balanceDataStatus:'disconnected',
      message:'No existing server bank connection was found.',
    }],
  ])

  const syncHandler=plaidConnect.match(/const syncAccounts = useCallback\(async[\s\S]*?\n  \}, \[onAccountsSync, onTransactionsSync\]\)/)?.[0] || ''
  assert.ok(syncHandler)
  assert.match(syncHandler,/const plaidAccounts = Array\.isArray\(data\.accounts\) \? data\.accounts : \[\][\s\S]*await onAccountsSync\(plaidAccounts, data\.syncedAt, data\.accountSourceReceipt, balanceAttemptErrors\)/)
  assert.match(syncHandler,/BALANCE_EMPTY_LIVE_RESPONSE/)
  assert.match(syncHandler,/status:'disconnected'[\s\S]*message:balanceDetail/)
  assert.match(syncHandler,/status:'stale'[\s\S]*message:balanceDetail/)
  assert.match(syncHandler,/status:'stale'[\s\S]*Transactions are an independent requested source refresh[\s\S]*await onTransactionsSync\(\)/)

  await assert.doesNotReject(()=>reportAttempt(async()=>{ throw new Error('state receiver failed') },{
    status:'stale',
    message:'Balance request failed.',
  }))
})

test('connection cache commits the roster before its timestamp so a second-write failure is conservative',()=>{
  const helperSource=plaidConnect.match(/function cacheCompleteConnectionSnapshot\([\s\S]*?\n\}/)?.[0] || ''
  assert.ok(helperSource)
  const commit=new Function(`${helperSource}; return cacheCompleteConnectionSnapshot`)()
  const values=new Map([
    ['plaid_connections','[{"itemId":"old"}]'],
    ['plaid_synced_at','2026-09-01T10:00:00.000Z'],
  ])
  const writes=[]
  const storage={
    setItem(key,value) {
      writes.push(key)
      if (key === 'plaid_synced_at') throw new Error('quota exceeded on second write')
      values.set(key,String(value))
    },
  }
  assert.throws(()=>commit(storage,[{itemId:'new'}],'2026-09-08T10:00:00.000Z'),/quota exceeded/)
  assert.deepEqual(writes,['plaid_connections','plaid_synced_at'])
  assert.equal(values.get('plaid_connections'),'[{"itemId":"new"}]')
  assert.equal(values.get('plaid_synced_at'),'2026-09-01T10:00:00.000Z')
})

test('Plaid balance failures use the inline bank status instead of duplicating a fixed finance alert',()=>{
  const handler=financePlanner.match(/const handlePlaidSync = useCallback\([\s\S]*?\n  \}, \[adoptBalanceAttempt, readOnly\]\)/)?.[0] || ''
  assert.ok(handler)
  assert.doesNotMatch(handler,/setStorageError/)
  assert.doesNotMatch(handler,/setStorageError\(error\.message/)
  assert.doesNotMatch(handler,/showToast\('⚠ Balances not updated/)
  assert.match(plaidConnect,/Bank balances were received but could not be saved safely/)
})

test('bank refresh status cannot erase an unrelated reviewed Finance error',()=>{
  const receiver=financePlanner.match(/const receiveRefresh = event => \{[\s\S]*?\n    \}/)?.[0] || ''
  assert.ok(receiver)
  assert.doesNotMatch(receiver,/setStorageError/)
})

test('dashboard bank controls wrap safely at phone width',()=>{
  assert.match(plaidConnect,/className="plaid-connect"/)
  assert.match(plaidConnect,/className="plaid-connect-disconnected"/)
  assert.match(financePlanner,/\.dash-actions \.plaid-connect[\s\S]*margin-bottom: 0 !important/)
  assert.match(financePlanner,/@media \(max-width: 768px\)[\s\S]*\.plaid-connect-disconnected \{ flex-wrap: wrap !important/)
})

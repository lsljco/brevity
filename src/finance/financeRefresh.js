import { loadFinanceData, migrateFinanceData } from './financeData.js'
import { persistSharedSourceImport } from '../household/sharedState.js'

export const FINANCE_STORAGE_KEY = 'lslj_finance_v9'
export const FINANCE_BUDGET_KEY = 'lslj_budget_v1'
export const PLAID_ACTUALS_KEY = 'plaid_actuals_cache'
export const FINANCE_REFRESH_EVENT = 'brevity-finance-refreshed'
export const TRANSACTION_FRESHNESS_KEY = 'brevity_plaid_transaction_freshness_v1'

const API = '/.netlify/functions'
const REQUEST_TIMEOUT_MS = 20000
const TRANSACTION_REFRESH_REQUEST_TIMEOUT_MS = 45000
// The transaction endpoint now performs bounded Plaid cursor pagination
// rather than an unbounded full-history date query. Give that bounded initial
// bootstrap enough time to finish and stage a replayable receipt. If the
// browser still aborts, the server outbox will replay the batch next time.
const TRANSACTION_SYNC_REQUEST_TIMEOUT_MS = 60000

async function apiFetch(path, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, signal: controller.signal })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.detail || body.error || `Finance refresh failed (${response.status}).`)
    return body
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(path.startsWith('/plaid-transactions')
        ? 'Transaction sync timed out before every institution confirmed. The last verified transaction history remains visible and is marked stale; retry safely.'
        : 'Finance refresh timed out; cached data remains available.')
      timeoutError.code = path.startsWith('/plaid-transactions') ? 'TRANSACTION_SYNC_TIMEOUT' : 'FINANCE_REFRESH_TIMEOUT'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function transactionSnapshotFingerprint(transactions = []) {
  return transactions
    .map(transaction => `${transaction?.id || ''}:${transaction?.pending ? 1 : 0}:${transaction?.date || ''}:${Number(transaction?.amount) || 0}`)
    .sort()
    .join('|')
}

export function transactionResponseFingerprint(payload = {}) {
  return `${transactionSnapshotFingerprint(payload.transactions || [])}::${(payload.removed || []).map(item => typeof item === 'string' ? item : item?.id || item?.transactionId || '').filter(Boolean).sort().join('|')}`
}

export function mergePlaidTransactionResponse(cached = [], payload = {}) {
  if (payload?.mode !== 'incremental') return mergePlaidTransactionSnapshots(cached, payload?.transactions || [], payload?.errors || [])
  const merged = new Map((Array.isArray(cached) ? cached : []).filter(item => item?.id).map(item => [item.id, item]))
  for (const removed of Array.isArray(payload.removed) ? payload.removed : []) {
    const id = typeof removed === 'string' ? removed : removed?.id || removed?.transactionId
    if (id) merged.delete(id)
  }
  for (const transaction of Array.isArray(payload.transactions) ? payload.transactions : []) {
    if (transaction?.id) merged.set(transaction.id, transaction)
  }
  return [...merged.values()].sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')))
}

export function readTransactionFreshness(storage) {
  try {
    const value = JSON.parse(storage?.getItem(TRANSACTION_FRESHNESS_KEY) || 'null')
    return value && typeof value === 'object' ? value : { status:'unknown', checkedAt:'', lastFullSuccessAt:'', errors:[] }
  } catch {
    return { status:'unknown', checkedAt:'', lastFullSuccessAt:'', errors:[] }
  }
}

export function recordTransactionFreshness(storage, update = {}) {
  const prior = readTransactionFreshness(storage)
  const status = ['fresh','partial','stale'].includes(update.status) ? update.status : 'unknown'
  const checkedAt = update.checkedAt || new Date().toISOString()
  const next = {
    ...prior,
    ...update,
    status,
    checkedAt,
    lastFullSuccessAt:status === 'fresh' ? checkedAt : prior.lastFullSuccessAt || '',
    errors:Array.isArray(update.errors) ? update.errors.map(String) : [],
  }
  storage?.setItem(TRANSACTION_FRESHNESS_KEY, JSON.stringify(next))
  return next
}

export function scopePlaidTransactionsByAccount(transactions = [], plaidIdToLocal = {}, activeAccountIds = new Set(), { includeUnmapped = false } = {}) {
  const included = []
  const unmapped = []
  for (const transaction of transactions) {
    const localAccountId = plaidIdToLocal[transaction?.accountId]
    if (!localAccountId) {
      unmapped.push(transaction)
      if (includeUnmapped) included.push(transaction)
    } else if (activeAccountIds.has(localAccountId)) {
      included.push(transaction)
    }
  }
  return { included, unmapped }
}

const normalizedInstitution = value => String(value || '').trim().toLowerCase()

export function mergePlaidTransactionSnapshots(cached = [], fresh = [], syncErrors = []) {
  if (!syncErrors.length) return Array.isArray(fresh) ? fresh : []

  const failedInstitutions = new Set(syncErrors.map(error => normalizedInstitution(error?.institution)).filter(Boolean))
  const merged = new Map((Array.isArray(fresh) ? fresh : []).filter(item => item?.id).map(item => [item.id, item]))

  for (const transaction of Array.isArray(cached) ? cached : []) {
    if (!transaction?.id || merged.has(transaction.id)) continue
    const institution = normalizedInstitution(transaction.institution)
    if (!failedInstitutions.size || !institution || failedInstitutions.has(institution)) merged.set(transaction.id, transaction)
  }

  return [...merged.values()].sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')))
}

function cachedPlaidTransactions(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(PLAID_ACTUALS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function fetchLatestPlaidTransactions({
  requestBankUpdate = false,
  fetcher = apiFetch,
} = {}) {
  let refreshResponse = null
  if (requestBankUpdate) {
    try {
      refreshResponse = await fetcher('/plaid-transactions?refresh=1&refresh_only=1', { timeoutMs: TRANSACTION_REFRESH_REQUEST_TIMEOUT_MS })
    } catch (error) {
      refreshResponse = {
        refresh:{
          requested:true,
          accepted:0,
          requestStatus:'unconfirmed',
          stillProcessing:false,
          errors:[{ institution:'Bank', code:error?.code || 'TRANSACTION_REFRESH_REQUEST_FAILED', message:error?.message || 'The bank update request could not be confirmed.' }],
        },
      }
    }
  }
  const initial = await fetcher('/plaid-transactions', { timeoutMs:TRANSACTION_SYNC_REQUEST_TIMEOUT_MS })
  const requested = Boolean(refreshResponse?.refresh?.requested)
  const accepted = Number(refreshResponse?.refresh?.accepted || 0)
  if (!requested || accepted === 0) return refreshResponse?.refresh
    ? { ...initial, refresh:refreshResponse.refresh }
    : initial

  // transactions/refresh is asynchronous. This batch can be a previously
  // staged delta or the state visible immediately before Plaid finishes the
  // requested update. Its receipt must be durably applied and acknowledged
  // before a later sync can observe the next delta, so never label this click
  // as a fully fresh post-request snapshot. The normal application refresh or
  // a safe retry will continue from the acknowledged cursor.
  return {
    ...initial,
    refresh:{
      ...refreshResponse.refresh,
      updated:transactionResponseFingerprint(initial) !== '::',
      stillProcessing:true,
    },
  }
}

const normalizeName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function compatibleAccountType(localAccount, plaidAccount) {
  const localType = String(localAccount?.type || '').toLowerCase()
  const plaidType = String(plaidAccount?.type || '').toLowerCase()
  const plaidSubtype = String(plaidAccount?.subtype || '').toLowerCase()
  if (localType === 'checking') return plaidSubtype === 'checking' || plaidType === 'depository'
  if (localType === 'savings') return plaidSubtype === 'savings'
  if (localType === 'credit') return plaidType === 'credit' || /credit card/.test(plaidSubtype)
  if (localType === 'investment') return plaidType === 'investment' || /brokerage|retirement/.test(plaidSubtype)
  return false
}

function nameCandidates(account, plaidAccounts, used) {
  const localName = normalizeName(account.name)
  if (!localName) return []
  const exact = plaidAccounts.filter(item => !used.has(item.accountId) && compatibleAccountType(account, item) && normalizeName(item.name) === localName)
  if (exact.length) return exact
  return plaidAccounts.filter(item => {
    if (used.has(item.accountId)) return false
    if (!compatibleAccountType(account, item)) return false
    const plaidName = normalizeName(item.name)
    return localName.length >= 5 && plaidName.length >= 5 && (plaidName.includes(localName) || localName.includes(plaidName))
  })
}

export function mergePlaidBalances(financeData, plaidAccounts = []) {
  if (!financeData?.accounts?.length || !plaidAccounts.length) return financeData
  const matchedPlaidIds = new Set()
  const accounts = financeData.accounts.map(account => ({ ...account }))

  const link = (account, match) => {
    if (!match?.accountId) return false
    matchedPlaidIds.add(match.accountId)
    account.balance = match.balance
    account.plaidAccountId = match.accountId
    // Keep Brevity's household-facing account label/type stable while
    // retaining the bank's source identity for traceability and support.
    account.plaidName = match.name || ''
    account.plaidOfficialName = match.officialName || ''
    account.plaidType = match.type || ''
    account.plaidSubtype = match.subtype || ''
    account.institution = match.institution || ''
    account.mask = match.mask || ''
    account.plaidCurrentBalance = match.availableBalance
    return true
  }

  // Existing IDs are authoritative.
  accounts.forEach(account => link(account, plaidAccounts.find(item => item.accountId && item.accountId === account.plaidAccountId)))

  // A name is safe only when it resolves to one unclaimed Plaid account.
  accounts.filter(account => !matchedPlaidIds.has(account.plaidAccountId)).forEach(account => {
    const candidates = nameCandidates(account, plaidAccounts, matchedPlaidIds)
    if (candidates.length === 1) link(account, candidates[0])
  })

  // Type-only matching is allowed only when exactly one local and one Plaid
  // account remain compatible. Ambiguous accounts stay explicitly unmapped.
  const unmatchedLocal = accounts.filter(account => !matchedPlaidIds.has(account.plaidAccountId))
  const unmatchedPlaid = plaidAccounts.filter(account => !matchedPlaidIds.has(account.accountId))
  if (unmatchedLocal.length === 1) {
    const candidates = unmatchedPlaid.filter(item => compatibleAccountType(unmatchedLocal[0], item))
    if (candidates.length === 1) link(unmatchedLocal[0], candidates[0])
  }
  return { ...financeData, accounts }
}

export async function refreshFinanceData(storage = window.localStorage, {
  requestBankUpdate = false,
  persist = true,
  fetchAccounts = () => apiFetch('/plaid-accounts'),
  fetchTransactions = options => fetchLatestPlaidTransactions(options),
  persistSourceImport = persistSharedSourceImport,
} = {}) {
  const [accountResult, transactionResult] = await Promise.allSettled([
    fetchAccounts(),
    fetchTransactions({ requestBankUpdate }),
  ])

  const storedFinance = loadFinanceData(storage, FINANCE_STORAGE_KEY).data
  let financeSourceCandidate = storedFinance
  let finance = migrateFinanceData(storedFinance)
  let financeNeedsPersistence = false
  let accounts = []
  const previousActuals = cachedPlaidTransactions(storage)
  let actuals = previousActuals
  let transactionDataStatus = 'stale'
  let transactionFailure = null
  let persistenceFailure = null
  let transactionPersistenceFailure = null
  const errors = []
  let accountPayload = null
  let transactionPayload = null

  if (accountResult.status === 'fulfilled') {
    const payload = accountResult.value
    accountPayload = payload
    accounts = payload.accounts || []
    ;(payload.errors || []).forEach(item => errors.push(`${item.institution}: ${item.message}`))
    if (payload.connected && accounts.length && storedFinance) {
      // Source ingestion may change only bank-owned balance/identity fields.
      // Do not fold client migrations or defaults into this write; those are
      // user-managed changes that require reviewed Action Mode.
      financeSourceCandidate = mergePlaidBalances(storedFinance, accounts)
      finance = migrateFinanceData(financeSourceCandidate)
      financeNeedsPersistence = JSON.stringify(financeSourceCandidate) !== JSON.stringify(storedFinance)
    } else if (payload.connected && accounts.length && !storedFinance) {
      errors.push('Bank balances were received, but no server-confirmed finance plan exists. Create the finance plan through reviewed Action Mode before importing balances.')
    }
  } else errors.push(accountResult.reason?.message || 'Account balances could not be refreshed.')

  if (transactionResult.status === 'fulfilled') {
    const payload = transactionResult.value
    transactionPayload = payload
    const syncErrors = payload.errors || []
    const refreshErrors = payload.refresh?.errors || []
    actuals = mergePlaidTransactionResponse(previousActuals, payload)
    transactionDataStatus = payload.connected === false ? 'stale' : syncErrors.length || refreshErrors.length || payload.refresh?.stillProcessing ? 'partial' : 'fresh'
    syncErrors.forEach(item => errors.push(`${item.institution}: ${item.message}`))
    refreshErrors.forEach(item => errors.push(`${item.institution}: ${item.message}`))
  } else {
    transactionFailure = transactionResult.reason instanceof Error
      ? transactionResult.reason
      : new Error(transactionResult.reason?.message || 'Transactions could not be refreshed.')
    errors.push(transactionFailure.message || 'Transactions could not be refreshed.')
  }

  if (persist) {
    const imports = []
    if (financeNeedsPersistence && financeSourceCandidate) {
      imports.push({
        key:FINANCE_STORAGE_KEY,
        promise:persistSourceImport(storage, FINANCE_STORAGE_KEY, financeSourceCandidate, { accountSourceReceipt:accountPayload?.accountSourceReceipt }),
      })
    }
    if (transactionResult.status === 'fulfilled' && transactionPayload?.connected !== false) {
      imports.push({
        key:PLAID_ACTUALS_KEY,
        promise:persistSourceImport(storage, PLAID_ACTUALS_KEY, actuals, { sourceReceipts:transactionPayload?.sourceReceipts }),
      })
    }

    const results = await Promise.allSettled(imports.map(item => item.promise))
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return
      const failure = result.reason instanceof Error
        ? result.reason
        : new Error('Bank data could not be durably synchronized.')
      if (!persistenceFailure) persistenceFailure = failure
      const failedKey = imports[index]?.key
      errors.push(`${failedKey === PLAID_ACTUALS_KEY ? 'Bank transactions' : 'Account balances'} were not saved: ${failure.message}`)
      if (failedKey === PLAID_ACTUALS_KEY) {
        transactionPersistenceFailure = failure
        actuals = cachedPlaidTransactions(storage)
        transactionDataStatus = 'stale'
      }
      if (failedKey === FINANCE_STORAGE_KEY) finance = migrateFinanceData(loadFinanceData(storage, FINANCE_STORAGE_KEY).data)
    })

    // Freshness is device metadata, not household financial truth. Record it
    // only after the versioned transaction snapshot has been acknowledged.
    try {
      if (transactionFailure || transactionPersistenceFailure) {
        recordTransactionFreshness(storage, {
          status:'stale',
          checkedAt:new Date().toISOString(),
          successfulInstitutions:[],
          errors:[transactionFailure?.message || transactionPersistenceFailure?.message || 'The transaction snapshot was not durably saved.'],
        })
      } else if (transactionResult.status === 'fulfilled') {
        recordTransactionFreshness(storage, {
          status:transactionDataStatus,
          checkedAt:transactionPayload?.syncedAt || new Date().toISOString(),
          successfulInstitutions:transactionPayload?.successfulInstitutions || [],
          errors:[...(transactionPayload?.errors || []), ...(transactionPayload?.refresh?.errors || [])]
            .map(item => `${item.institution || 'Bank'}: ${item.message || 'could not be refreshed'}`),
        })
      }
    } catch (error) {
      if (!persistenceFailure) persistenceFailure = error
      errors.push(`Transaction freshness could not be saved: ${error.message || 'browser storage is unavailable.'}`)
    }

    // Connection metadata is a local rendering cache. Update it only after all
    // authoritative balance/transaction records have been acknowledged.
    if (!persistenceFailure && !transactionFailure && accountPayload) {
      try {
        if (accountPayload.syncedAt) storage.setItem('plaid_synced_at', accountPayload.syncedAt)
        if (accountPayload.connected) {
          const grouped = {}
          accounts.forEach(account => {
            if (!grouped[account.itemId]) grouped[account.itemId] = { itemId: account.itemId, institution: account.institution, accounts: [] }
            grouped[account.itemId].accounts.push(account)
          })
          storage.setItem('plaid_connections', JSON.stringify(Object.values(grouped)))
        }
      } catch (error) {
        persistenceFailure = error
        errors.push(`Bank refresh metadata was not saved: ${error.message || 'browser storage is unavailable.'}`)
      }
    }
  }

  const refreshFailure = transactionFailure || persistenceFailure
  const transactionRefreshFailed = Boolean(transactionFailure || transactionPersistenceFailure)
  const detail = {
    finance,
    accounts,
    // Do not publish an empty replacement when the request failed. The Finance
    // screen initializes from the same cache and must retain its last-known
    // snapshot while the application-level refresh retries.
    actuals: transactionRefreshFailed ? undefined : actuals,
    lastKnownActuals: actuals,
    transactionDataStatus,
    errors,
    transactionRefresh: transactionResult.status === 'fulfilled' ? transactionResult.value?.refresh || null : null,
    transactionFreshness:readTransactionFreshness(storage),
    refreshedAt: new Date().toISOString(),
  }
  if (refreshFailure) {
    refreshFailure.detail = detail
    throw refreshFailure
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FINANCE_REFRESH_EVENT, { detail }))
  return detail
}

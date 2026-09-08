import { loadFinanceData, migrateFinanceData } from './financeData.js'
import { persistSharedSourceImport } from '../household/sharedState.js'

export const FINANCE_STORAGE_KEY = 'lslj_finance_v9'
export const FINANCE_BUDGET_KEY = 'lslj_budget_v1'
export const PLAID_ACTUALS_KEY = 'plaid_actuals_cache'
export const FINANCE_REFRESH_EVENT = 'brevity-finance-refreshed'
export const TRANSACTION_FRESHNESS_KEY = 'brevity_plaid_transaction_freshness_v1'
export const TRANSACTION_FRESHNESS_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const BALANCE_FRESHNESS_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const LIVE_BALANCE_MODE = 'live'
export const LIVE_BALANCE_PROVENANCE = 'plaid.accountsBalanceGet'

const API = '/.netlify/functions'
const REQUEST_TIMEOUT_MS = 20000
const TRANSACTION_REFRESH_REQUEST_TIMEOUT_MS = 45000
// The transaction endpoint now performs bounded Plaid cursor pagination
// rather than an unbounded full-history date query. Give that bounded initial
// bootstrap enough time to finish and stage a replayable receipt. If the
// browser still aborts, the server outbox will replay the batch next time.
const TRANSACTION_SYNC_REQUEST_TIMEOUT_MS = 60000

let latestBalanceRefreshStatus = null

const unknownBalanceRefreshStatus = () => ({
  status:'unknown',
  errors:[],
  checkedAt:'',
  balanceMode:'unknown',
  balanceProvenance:'',
})

/**
 * Returns the most recent balance attempt for screens that mount after the
 * refresh event. This is intentionally page-memory only: cached account data
 * must not become a durable freshness claim. A once-fresh live attempt also
 * ages closed instead of remaining "fresh" for the lifetime of the tab.
 */
export function readLatestBalanceRefreshStatus(now = new Date()) {
  if (!latestBalanceRefreshStatus) return unknownBalanceRefreshStatus()
  const snapshot = { ...latestBalanceRefreshStatus, errors:[...latestBalanceRefreshStatus.errors] }
  if (snapshot.status !== 'fresh') return snapshot
  const checkedAt = Date.parse(snapshot.checkedAt || '')
  const age = now.getTime() - checkedAt
  if (snapshot.balanceMode !== LIVE_BALANCE_MODE || snapshot.balanceProvenance !== LIVE_BALANCE_PROVENANCE || !Number.isFinite(checkedAt) || age > BALANCE_FRESHNESS_MAX_AGE_MS || age < -60_000) {
    return {
      ...snapshot,
      status:'stale',
      errors:[...snapshot.errors, age < -60_000
        ? 'The latest live balance timestamp is in the future and cannot verify this snapshot.'
        : 'The latest live balance check is no longer recent enough to present as fresh.'],
    }
  }
  return snapshot
}

export function recordLatestBalanceRefreshStatus(detail = {}) {
  latestBalanceRefreshStatus = Object.freeze({
    status:detail.balanceDataStatus || 'unknown',
    errors:Object.freeze([...(detail.balanceErrors || [])].map(String)),
    checkedAt:detail.balanceCheckedAt || detail.refreshedAt || '',
    balanceMode:detail.balanceMode || 'unknown',
    balanceProvenance:detail.balanceProvenance || '',
  })
  return readLatestBalanceRefreshStatus()
}

export function invalidateLatestBalanceRefreshStatus(message = 'Balance freshness is not verified for the current household snapshot.') {
  latestBalanceRefreshStatus = Object.freeze({
    status:'unknown',
    errors:Object.freeze(message ? [String(message)] : []),
    checkedAt:'',
    balanceMode:'unknown',
    balanceProvenance:'',
  })
  return readLatestBalanceRefreshStatus()
}

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

const TRANSACTION_FINGERPRINT_FIELDS = ['id','accountId','itemId','name','originalStatement','amount','date','category','type','institution','pending']

// This is a compact, deterministic 128-bit mutation detector, not an
// authentication primitive. Length-framed parts keep field and row boundaries
// unambiguous without storing the full serialized transaction history.
function compactDigest(parts = []) {
  let h1 = 1779033703 ^ parts.length
  let h2 = 3144134277 ^ parts.length
  let h3 = 1013904242 ^ parts.length
  let h4 = 2773480762 ^ parts.length
  const update = value => {
    const text = String(value)
    const framed = `${text.length}:`
    for (const segment of [framed, text]) {
      for (let index = 0; index < segment.length; index += 1) {
        const code = segment.charCodeAt(index)
        h1 = h2 ^ Math.imul(h1 ^ code, 597399067)
        h2 = h3 ^ Math.imul(h2 ^ code, 2869860233)
        h3 = h4 ^ Math.imul(h3 ^ code, 951274213)
        h4 = h1 ^ Math.imul(h4 ^ code, 2716044179)
      }
    }
  }
  parts.forEach(update)
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1,h2,h3,h4].map(value => (value >>> 0).toString(16).padStart(8, '0')).join('')
}

export function transactionSnapshotFingerprint(transactions = []) {
  const rows = (Array.isArray(transactions) ? transactions : [])
    .map(transaction => JSON.stringify(TRANSACTION_FINGERPRINT_FIELDS.map(field => transaction?.[field] ?? null)))
    .sort()
  return `tx1:${rows.length}:${compactDigest(['transaction-snapshot-v1', ...rows])}`
}

export function transactionResponseFingerprint(payload = {}) {
  const transactions = Array.isArray(payload?.transactions) ? payload.transactions : []
  const removed = (Array.isArray(payload?.removed) ? payload.removed : [])
    .map(item => typeof item === 'string' ? item : item?.id || item?.transactionId || '')
    .filter(Boolean)
    .sort()
  return `tr1:${transactions.length}:${removed.length}:${compactDigest(['transaction-response-v1', transactionSnapshotFingerprint(transactions), ...removed])}`
}

export function mergePlaidTransactionResponse(cached = [], payload = {}) {
  // A disconnected response describes source availability, not an
  // authoritative empty ledger. Keep the last durably acknowledged snapshot
  // visible and let freshness mark it stale.
  if (payload?.connected === false) return Array.isArray(cached) ? cached : []
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

export function readTransactionFreshness(storage, now = new Date()) {
  try {
    const value = JSON.parse(storage?.getItem(TRANSACTION_FRESHNESS_KEY) || 'null')
    if (!value || typeof value !== 'object') return { status:'unknown', checkedAt:'', lastFullSuccessAt:'', errors:[] }
    const currentFingerprint = transactionSnapshotFingerprint(cachedPlaidTransactions(storage))
    if (!value.snapshotFingerprint || value.snapshotFingerprint !== currentFingerprint) {
      return {
        ...value,
        status:'unknown',
        checkedAt:'',
        errors:['Transaction freshness is not verified for the current household snapshot.'],
      }
    }
    const checkedAt = Date.parse(value.checkedAt || '')
    const age = now.getTime() - checkedAt
    if (value.status === 'fresh' && (!Number.isFinite(checkedAt) || age > TRANSACTION_FRESHNESS_MAX_AGE_MS || age < -60_000)) {
      return {
        ...value,
        status:'stale',
        errors:[...(Array.isArray(value.errors) ? value.errors : []), age < -60_000
          ? 'The saved Plaid freshness timestamp is in the future and cannot verify this snapshot.'
          : 'The last successful Plaid snapshot check is more than 24 hours old.'],
      }
    }
    return value
  } catch {
    return { status:'unknown', checkedAt:'', lastFullSuccessAt:'', errors:[] }
  }
}

export function recordTransactionFreshness(storage, update = {}) {
  const prior = readTransactionFreshness(storage)
  const next = deriveTransactionFreshness(prior, {
    ...update,
    snapshotFingerprint:update.snapshotFingerprint ?? transactionSnapshotFingerprint(cachedPlaidTransactions(storage)),
  })
  storage?.setItem(TRANSACTION_FRESHNESS_KEY, JSON.stringify(next))
  return next
}

export function deriveTransactionFreshness(prior = {}, update = {}) {
  const status = ['fresh','partial','stale'].includes(update.status) ? update.status : 'unknown'
  const checkedAt = update.checkedAt || new Date().toISOString()
  return {
    ...prior,
    ...update,
    status,
    checkedAt,
    lastFullSuccessAt:status === 'fresh' ? checkedAt : prior.lastFullSuccessAt || '',
    errors:Array.isArray(update.errors) ? update.errors.map(String) : [],
  }
}

export function scopePlaidTransactionsByAccount(transactions = [], plaidIdToLocal = {}, activeAccountIds = new Set(), { includeUnmapped = false } = {}) {
  const included = []
  const unmapped = []
  for (const transaction of transactions) {
    // A Plaid item or institution can contain accounts that are not represented
    // in Brevity. Only the source account ID is specific enough to assign a row.
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
      updated:transactionResponseFingerprint(initial) !== transactionResponseFingerprint(),
      stillProcessing:true,
    },
  }
}

const normalizeName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function compatiblePlaidAccountType(localAccount, plaidAccount) {
  const localType = String(localAccount?.type || '').toLowerCase()
  const plaidType = String(plaidAccount?.type || '').toLowerCase()
  const plaidSubtype = String(plaidAccount?.subtype || '').toLowerCase()
  if (localType === 'checking') return plaidType === 'depository' && plaidSubtype === 'checking'
  if (localType === 'savings') return plaidType === 'depository' && plaidSubtype === 'savings'
  if (localType === 'credit') return plaidType === 'credit'
  if (localType === 'investment') return plaidType === 'investment'
  return false
}

function nameCandidates(account, plaidAccounts, used) {
  const localName = normalizeName(account.name)
  if (!localName) return []
  return plaidAccounts.filter(item => !used.has(item.accountId) && compatiblePlaidAccountType(account, item) && normalizeName(item.name) === localName)
}

function missingLinkedLocalAccountIds(financeData, plaidAccounts) {
  const returnedPlaidIds = new Set((plaidAccounts || []).map(account => account?.accountId).filter(Boolean))
  return (financeData?.accounts || [])
    .filter(account => account?.plaidAccountId && !returnedPlaidIds.has(account.plaidAccountId))
    .map(account => account.id)
}

function missingLinkedBalanceMessage(count) {
  return `${count} previously linked Brevity ${count === 1 ? 'account was' : 'accounts were'} not present in the live bank response. ${count === 1 ? 'Its' : 'Their'} prior ${count === 1 ? 'balance was' : 'balances were'} retained, and the last complete balance-check time is unchanged.`
}

export function mergePlaidBalancesWithDiagnostics(financeData, plaidAccounts = []) {
  const missingLinkedIds = missingLinkedLocalAccountIds(financeData, plaidAccounts)
  if (!financeData?.accounts?.length || !plaidAccounts.length) {
    return {
      finance:financeData,
      matchedCount:0,
      matchedPlaidAccountIds:[],
      ambiguousPlaidAccountIds:[],
      ambiguousLocalAccountIds:[],
      incompatiblePlaidAccountIds:[],
      incompatibleLocalAccountIds:[],
      invalidLocalAccountIds:[],
      missingLinkedLocalAccountIds:missingLinkedIds,
      unmatchedLocalAccountIds:(financeData?.accounts || []).map(account => account.id),
      unmatchedPlaidAccountIds:(plaidAccounts || []).map(account => account.accountId).filter(Boolean),
    }
  }
  const matchedPlaidIds = new Set()
  const matchedLocalIds = new Set()
  const accounts = financeData.accounts.map(account => ({ ...account }))
  const localIdCounts = new Map()
  accounts.forEach(account => {
    const id = String(account?.id || '')
    localIdCounts.set(id, (localIdCounts.get(id) || 0) + 1)
  })
  const invalidLocalAccountIds = accounts
    .map((account, index) => ({ id:String(account?.id || ''), index }))
    .filter(item => !item.id || localIdCounts.get(item.id) > 1)
    .map(item => item.id || `index:${item.index}`)
  if (invalidLocalAccountIds.length) {
    return {
      finance:financeData,
      matchedCount:0,
      matchedPlaidAccountIds:[],
      ambiguousPlaidAccountIds:[],
      ambiguousLocalAccountIds:[],
      incompatiblePlaidAccountIds:[],
      incompatibleLocalAccountIds:[],
      invalidLocalAccountIds,
      missingLinkedLocalAccountIds:missingLinkedIds,
      unmatchedLocalAccountIds:accounts.map(account => account.id),
      unmatchedPlaidAccountIds:plaidAccounts.map(account => account.accountId).filter(Boolean),
    }
  }
  const localPlaidIdCounts = new Map()
  accounts.forEach(account => {
    if (!account.plaidAccountId) return
    localPlaidIdCounts.set(account.plaidAccountId, (localPlaidIdCounts.get(account.plaidAccountId) || 0) + 1)
  })
  const ambiguousPlaidIds = new Set([...localPlaidIdCounts]
    .filter(([, count]) => count > 1)
    .map(([accountId]) => accountId))
  const ambiguousLocalIds = new Set(accounts
    .filter(account => ambiguousPlaidIds.has(account.plaidAccountId))
    .map(account => account.id))

  // A persisted source ID establishes identity, but it never overrides the
  // household account's financial type. If Plaid now presents that identity
  // as a different kind of account, fail the entire balance merge closed so a
  // credit liability cannot be imported as checking cash (or vice versa).
  const incompatibleLinks = accounts.flatMap(account => {
    if (!account.plaidAccountId || ambiguousPlaidIds.has(account.plaidAccountId)) return []
    const match = plaidAccounts.find(item => item.accountId && item.accountId === account.plaidAccountId)
    return match && !compatiblePlaidAccountType(account, match) ? [{ account, match }] : []
  })
  if (incompatibleLinks.length) {
    return {
      finance:financeData,
      matchedCount:0,
      matchedPlaidAccountIds:[],
      ambiguousPlaidAccountIds:[...ambiguousPlaidIds],
      ambiguousLocalAccountIds:[...ambiguousLocalIds],
      incompatiblePlaidAccountIds:[...new Set(incompatibleLinks.map(({ match }) => match.accountId))],
      incompatibleLocalAccountIds:[...new Set(incompatibleLinks.map(({ account }) => account.id))],
      invalidLocalAccountIds:[],
      missingLinkedLocalAccountIds:missingLinkedIds,
      unmatchedLocalAccountIds:accounts.map(account => account.id),
      unmatchedPlaidAccountIds:plaidAccounts.map(account => account.accountId).filter(Boolean),
    }
  }

  const link = (account, match) => {
    if (!match?.accountId || ambiguousPlaidIds.has(match.accountId) || matchedPlaidIds.has(match.accountId)) return false
    matchedPlaidIds.add(match.accountId)
    matchedLocalIds.add(account.id)
    account.balance = match.balance
    account.plaidAccountId = match.accountId
    if (match.itemId) account.plaidItemId = match.itemId
    // Keep Brevity's household-facing account label/type stable while
    // retaining the bank's source identity for traceability and support.
    account.plaidName = match.name || ''
    account.plaidOfficialName = match.officialName || ''
    account.plaidType = match.type || ''
    account.plaidSubtype = match.subtype || ''
    account.institution = match.institution || ''
    account.mask = match.mask || ''
    account.plaidCurrentBalance = Number.isFinite(match.currentBalance) ? match.currentBalance : undefined
    account.plaidAvailableBalance = Number.isFinite(match.availableBalance) ? match.availableBalance : undefined
    return true
  }

  // Existing IDs are authoritative.
  accounts.forEach(account => link(account, plaidAccounts.find(item => item.accountId && item.accountId === account.plaidAccountId)))

  // Resolve exact names globally. A link is safe only when both the local and
  // source account have one unique candidate; array order must never decide it.
  const nameEligible = accounts.filter(account => !account.plaidAccountId && !matchedLocalIds.has(account.id) && !ambiguousLocalIds.has(account.id))
  const nameMatches = new Map(nameEligible.map(account => [account.id, nameCandidates(account, plaidAccounts, matchedPlaidIds)]))
  const nameSourceCounts = new Map()
  nameMatches.forEach(matches => matches.forEach(match => nameSourceCounts.set(match.accountId, (nameSourceCounts.get(match.accountId) || 0) + 1)))
  nameEligible.forEach(account => {
    const candidates = nameMatches.get(account.id) || []
    if (candidates.length === 1 && nameSourceCounts.get(candidates[0].accountId) === 1) link(account, candidates[0])
  })

  return {
    finance:{ ...financeData, accounts },
    matchedCount:matchedLocalIds.size,
    matchedPlaidAccountIds:[...matchedPlaidIds],
    ambiguousPlaidAccountIds:[...ambiguousPlaidIds],
    ambiguousLocalAccountIds:[...ambiguousLocalIds],
    incompatiblePlaidAccountIds:[],
    incompatibleLocalAccountIds:[],
    invalidLocalAccountIds:[],
    missingLinkedLocalAccountIds:missingLinkedIds,
    unmatchedLocalAccountIds:accounts.filter(account => !matchedLocalIds.has(account.id)).map(account => account.id),
    unmatchedPlaidAccountIds:plaidAccounts.filter(account => !matchedPlaidIds.has(account.accountId)).map(account => account.accountId).filter(Boolean),
  }
}

export function mergePlaidBalances(financeData, plaidAccounts = []) {
  return mergePlaidBalancesWithDiagnostics(financeData, plaidAccounts).finance
}

export function classifyPlaidBalanceGaps(diagnostics = {}) {
  const unmatchedReturnedCount = diagnostics?.unmatchedPlaidAccountIds?.length || 0
  const unmatchedLocalCount = diagnostics?.unmatchedLocalAccountIds?.length || 0
  const missingLinkedCount = diagnostics?.missingLinkedLocalAccountIds?.length || 0
  const linkReviewAvailable = unmatchedReturnedCount > 0 && unmatchedLocalCount > 0
  return {
    matchedCount:diagnostics?.matchedCount || 0,
    unmatchedReturnedCount,
    unmatchedLocalCount,
    missingLinkedCount,
    linkReviewAvailable,
    // Plaid commonly returns every account available under an institution.
    // Once every Brevity account has a verified match, additional source
    // accounts are intentionally untracked—not a failed balance refresh.
    untrackedReturnedCount:linkReviewAvailable ? 0 : unmatchedReturnedCount,
  }
}

/**
 * Build a Plaid balance write from the persisted household record, not from a
 * migrated/restored view model. FinancePlanner intentionally applies display
 * migrations in memory, but source ingestion is allowed to change only the
 * bank-owned account fields. Folding those display migrations into this write
 * would make the server (correctly) reject the whole snapshot.
 */
export function buildPlaidBalanceSourceCandidate(storage, plaidAccounts = [], key = FINANCE_STORAGE_KEY) {
  return buildPlaidBalanceSourceResult(storage, plaidAccounts, key).finance
}

export function buildPlaidBalanceSourceResult(storage, plaidAccounts = [], key = FINANCE_STORAGE_KEY) {
  const loaded = loadFinanceData(storage, key)
  if (loaded.source !== 'primary') return { finance:null, diagnostics:null }
  const storedFinance = loaded.data
  if (!storedFinance || typeof storedFinance !== 'object' || Array.isArray(storedFinance)) return { finance:null, diagnostics:null }
  const diagnostics = mergePlaidBalancesWithDiagnostics(storedFinance, plaidAccounts)
  const safe = diagnostics.matchedCount > 0
    && diagnostics.ambiguousPlaidAccountIds.length === 0
    && diagnostics.incompatiblePlaidAccountIds.length === 0
    && diagnostics.invalidLocalAccountIds.length === 0
  return { finance:safe ? diagnostics.finance : null, diagnostics }
}

function hasImportableLiveBalanceProof(payload) {
  const receipt = payload?.accountSourceReceipt
  return payload?.balanceMode === LIVE_BALANCE_MODE
    && payload?.balanceProvenance === LIVE_BALANCE_PROVENANCE
    && typeof receipt?.payload === 'string'
    && receipt.payload.length > 0
    && /^[a-f0-9]{64}$/.test(String(receipt?.signature || ''))
}

export async function refreshFinanceData(storage = window.localStorage, {
  requestBankUpdate = false,
  persist = true,
  fetchAccounts = ({ requestBankUpdate:requestLiveBalances = false } = {}) => apiFetch(requestLiveBalances ? '/plaid-accounts?live=1' : '/plaid-accounts'),
  fetchTransactions = options => fetchLatestPlaidTransactions(options),
  persistSourceImport = persistSharedSourceImport,
} = {}) {
  const [accountResult, transactionResult] = await Promise.allSettled([
    fetchAccounts({ requestBankUpdate }),
    fetchTransactions({ requestBankUpdate }),
  ])

  const loadedFinance = loadFinanceData(storage, FINANCE_STORAGE_KEY)
  const storedFinance = loadedFinance.data
  const verifiedFinanceSource = loadedFinance.source === 'primary' ? storedFinance : null
  let financeSourceCandidate = verifiedFinanceSource
  let finance = migrateFinanceData(storedFinance)
  let financeNeedsPersistence = false
  let accounts = []
  const previousActuals = cachedPlaidTransactions(storage)
  let actuals = previousActuals
  let transactionDataStatus = 'stale'
  let transactionFreshness = readTransactionFreshness(storage)
  let balanceDataStatus = 'stale'
  let transactionFailure = null
  let persistenceFailure = null
  let transactionPersistenceFailure = null
  const errors = []
  const balanceErrors = []
  const addBalanceError = message => { balanceErrors.push(message); errors.push(message) }
  let accountPayload = null
  let transactionPayload = null
  let liveBalanceProof = false
  let missingLinkedAccountCount = 0

  if (accountResult.status === 'fulfilled') {
    const payload = accountResult.value
    accountPayload = payload
    accounts = payload.accounts || []
    const accountErrors = payload.errors || []
    liveBalanceProof = hasImportableLiveBalanceProof(payload)
    if (payload.connected === false) {
      balanceDataStatus = 'disconnected'
    } else if (payload.balanceMode === 'cached') {
      balanceDataStatus = accountErrors.length ? 'partial' : 'cached'
      accountErrors.forEach(item => addBalanceError(`${item.institution || 'Bank'}: ${item.message || 'connection check was not confirmed'}`))
      balanceErrors.push('Connected accounts were checked from Plaid cache. No balance was refreshed, imported, or marked current.')
    } else if (!liveBalanceProof) {
      balanceDataStatus = accountErrors.length ? 'partial' : 'unverified'
      accountErrors.forEach(item => addBalanceError(`${item.institution || 'Bank'}: ${item.message || 'balance refresh was not confirmed'}`))
      addBalanceError('The account response did not include a signed live-balance receipt. Existing balances and the last complete balance-check time remain unchanged.')
    } else {
      balanceDataStatus = accountErrors.length ? 'partial' : 'fresh'
      accountErrors.forEach(item => addBalanceError(`${item.institution || 'Bank'}: ${item.message || 'balance refresh was not confirmed'}`))
    }
    if (liveBalanceProof && payload.connected && accounts.length && verifiedFinanceSource) {
      // Source ingestion may change only bank-owned balance/identity fields.
      // Do not fold client migrations or defaults into this write; those are
      // user-managed changes that require reviewed Action Mode.
      const merged = mergePlaidBalancesWithDiagnostics(verifiedFinanceSource, accounts)
      missingLinkedAccountCount = merged.missingLinkedLocalAccountIds.length
      if (merged.invalidLocalAccountIds.length) {
        balanceDataStatus = 'ambiguous'
        addBalanceError('Bank balances were received, but the finance plan contains missing or duplicate local account identities. Existing balances remain unchanged until account linkage is repaired.')
      } else if (merged.incompatiblePlaidAccountIds.length) {
        balanceDataStatus = 'incompatible'
        addBalanceError(`Bank balances were received, but ${merged.incompatiblePlaidAccountIds.length} linked bank ${merged.incompatiblePlaidAccountIds.length === 1 ? 'account has' : 'accounts have'} a different financial type than its Brevity account. Existing balances remain unchanged until account linkage is repaired.`)
      } else if (merged.ambiguousPlaidAccountIds.length) {
        balanceDataStatus = 'ambiguous'
        addBalanceError(`Bank balances were received, but ${merged.ambiguousPlaidAccountIds.length} source account ${merged.ambiguousPlaidAccountIds.length === 1 ? 'ID is' : 'IDs are'} linked to more than one Brevity account. Existing balances remain unchanged until account linkage is repaired.`)
      } else if (merged.matchedCount === 0) {
        if (missingLinkedAccountCount) {
          balanceDataStatus = 'partial'
          addBalanceError(missingLinkedBalanceMessage(missingLinkedAccountCount))
          if (merged.unmatchedPlaidAccountIds.length) addBalanceError(`${merged.unmatchedPlaidAccountIds.length} returned bank ${merged.unmatchedPlaidAccountIds.length === 1 ? 'account does' : 'accounts do'} not match a Brevity account and remain excluded.`)
        } else {
          balanceDataStatus = 'unmatched'
          addBalanceError('Bank balances were received, but none matched a verified Brevity account. Existing balances remain unchanged; review account linkage before relying on the refresh status.')
        }
      } else {
        financeSourceCandidate = merged.finance
        finance = migrateFinanceData(financeSourceCandidate)
        // Even an unchanged live value must be acknowledged durably so its
        // signed provenance/anti-replay watermark reaches household state.
        financeNeedsPersistence = true
        if (merged.unmatchedPlaidAccountIds.length) {
          balanceDataStatus = 'partial'
          addBalanceError(`${merged.matchedCount} bank ${merged.matchedCount === 1 ? 'balance was' : 'balances were'} matched; ${merged.unmatchedPlaidAccountIds.length} bank ${merged.unmatchedPlaidAccountIds.length === 1 ? 'account is' : 'accounts are'} not linked to a Brevity account and remain excluded.`)
        }
        if (missingLinkedAccountCount) {
          balanceDataStatus = 'partial'
          addBalanceError(missingLinkedBalanceMessage(missingLinkedAccountCount))
        }
      }
    } else if (liveBalanceProof && payload.connected && accounts.length && !verifiedFinanceSource) {
      balanceDataStatus = 'unverified'
      addBalanceError('Bank balances were received, but no server-confirmed finance plan exists. Create the finance plan through reviewed Action Mode before importing balances.')
    } else if (liveBalanceProof && payload.connected && !accounts.length) {
      const merged = verifiedFinanceSource ? mergePlaidBalancesWithDiagnostics(verifiedFinanceSource, []) : null
      missingLinkedAccountCount = merged?.missingLinkedLocalAccountIds?.length || 0
      balanceDataStatus = missingLinkedAccountCount || accountErrors.length ? 'partial' : 'unverified'
      addBalanceError(missingLinkedAccountCount
        ? missingLinkedBalanceMessage(missingLinkedAccountCount)
        : 'The bank source reported a connection but returned no verified account balances. Existing balances and the last complete balance-check time remain unchanged.')
    }
  } else {
    balanceDataStatus = 'stale'
    addBalanceError(accountResult.reason?.message || 'Account balances could not be refreshed.')
  }

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
    if (liveBalanceProof && financeNeedsPersistence && financeSourceCandidate) {
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
      const persistenceMessage = `${failedKey === PLAID_ACTUALS_KEY ? 'Bank transactions' : 'Account balances'} were not saved: ${failure.message}`
      errors.push(persistenceMessage)
      if (failedKey === FINANCE_STORAGE_KEY) balanceErrors.push(persistenceMessage)
      if (failedKey === PLAID_ACTUALS_KEY) {
        transactionPersistenceFailure = failure
        actuals = cachedPlaidTransactions(storage)
        transactionDataStatus = 'stale'
      }
      if (failedKey === FINANCE_STORAGE_KEY) {
        balanceDataStatus = 'stale'
        finance = migrateFinanceData(loadFinanceData(storage, FINANCE_STORAGE_KEY).data)
      }
    })

  }

  // Always derive freshness from this attempt, including read-only refreshes.
  // Only the device-cache write is gated by `persist`.
  const freshnessUpdate = transactionFailure || transactionPersistenceFailure
    ? {
        status:'stale',
        checkedAt:new Date().toISOString(),
          successfulInstitutions:[],
          snapshotFingerprint:transactionSnapshotFingerprint(actuals),
        errors:[transactionFailure?.message || transactionPersistenceFailure?.message || 'The transaction snapshot was not durably saved.'],
      }
    : transactionResult.status === 'fulfilled'
      ? {
          status:transactionDataStatus,
          checkedAt:transactionPayload?.syncedAt || new Date().toISOString(),
          successfulInstitutions:transactionPayload?.successfulInstitutions || [],
          snapshotFingerprint:transactionSnapshotFingerprint(actuals),
          errors:[...(transactionPayload?.errors || []), ...(transactionPayload?.refresh?.errors || [])]
            .map(item => `${item.institution || 'Bank'}: ${item.message || 'could not be refreshed'}`),
        }
      : null
  if (freshnessUpdate) {
    transactionFreshness = deriveTransactionFreshness(transactionFreshness, freshnessUpdate)
    if (persist) {
      try {
        storage?.setItem(TRANSACTION_FRESHNESS_KEY, JSON.stringify(transactionFreshness))
      } catch (error) {
        if (!persistenceFailure) persistenceFailure = error
        errors.push(`Transaction freshness could not be saved: ${error.message || 'browser storage is unavailable.'}`)
      }
    }
  }

  // Connection metadata represents the last complete, safely acknowledged
  // balance check. Partial, unmatched, and ambiguous attempts leave it intact.
  if (persist && !persistenceFailure && accountPayload) {
    try {
      if (accountPayload.connected === false) {
        storage?.removeItem?.('plaid_connections')
        storage?.removeItem?.('plaid_synced_at')
      } else if (liveBalanceProof && balanceDataStatus === 'fresh') {
        const grouped = {}
        accounts.forEach(account => {
          if (!grouped[account.itemId]) grouped[account.itemId] = { itemId: account.itemId, institution: account.institution, accounts: [] }
          grouped[account.itemId].accounts.push(account)
        })
        // Write the roster before its timestamp. If browser storage fails
        // between writes, an old roster can never be mislabeled with a newer
        // complete-check time.
        storage.setItem('plaid_connections', JSON.stringify(Object.values(grouped)))
        if (accountPayload.syncedAt) storage.setItem('plaid_synced_at', accountPayload.syncedAt)
      }
    } catch (error) {
      persistenceFailure = error
      const metadataMessage = `Bank refresh metadata was not saved: ${error.message || 'browser storage is unavailable.'}`
      errors.push(metadataMessage)
      balanceErrors.push(metadataMessage)
    }
  }

  const refreshFailure = transactionFailure || persistenceFailure
  const transactionRefreshFailed = Boolean(transactionFailure || transactionPersistenceFailure)
  // Non-live account responses are connection metadata only. Re-read the
  // durable plan immediately before publishing so a slower cached request can
  // never replace a live balance that another request has already saved.
  if (!liveBalanceProof) finance = migrateFinanceData(loadFinanceData(storage, FINANCE_STORAGE_KEY).data)
  const refreshedAt = new Date().toISOString()
  const detail = {
    finance,
    accounts,
    // Do not publish an empty replacement when the request failed. The Finance
    // screen initializes from the same cache and must retain its last-known
    // snapshot while the application-level refresh retries.
    actuals: transactionRefreshFailed ? undefined : actuals,
    lastKnownActuals: actuals,
    transactionDataStatus,
    balanceDataStatus,
    balanceErrors,
    missingLinkedAccountCount,
    balanceMode:accountPayload?.balanceMode || (accountPayload?.connected === false ? 'disconnected' : 'unknown'),
    balanceProvenance:accountPayload?.balanceProvenance || '',
    balanceCheckedAt:accountPayload?.syncedAt || refreshedAt,
    errors,
    transactionRefresh: transactionResult.status === 'fulfilled' ? transactionResult.value?.refresh || null : null,
    transactionFreshness,
    refreshedAt,
  }
  recordLatestBalanceRefreshStatus(detail)
  // A failed refresh still changes what this mounted screen may safely claim.
  // Publish the diagnostic detail before rejecting; cached rows remain intact
  // because failed sources are omitted from the event payload above.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FINANCE_REFRESH_EVENT, { detail }))
  if (refreshFailure) {
    refreshFailure.detail = detail
    throw refreshFailure
  }
  return detail
}

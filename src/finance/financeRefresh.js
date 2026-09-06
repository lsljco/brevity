import { loadFinanceData, migrateFinanceData, saveFinanceData } from './financeData.js'

export const FINANCE_STORAGE_KEY = 'lslj_finance_v9'
export const FINANCE_BUDGET_KEY = 'lslj_budget_v1'
export const PLAID_ACTUALS_KEY = 'plaid_actuals_cache'
export const FINANCE_REFRESH_EVENT = 'brevity-finance-refreshed'

const API = '/.netlify/functions'
const REQUEST_TIMEOUT_MS = 20000
const TRANSACTION_REFRESH_DELAYS_MS = [6000, 12000]

async function apiFetch(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, signal: controller.signal })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.detail || body.error || `Finance refresh failed (${response.status}).`)
    return body
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Finance refresh timed out; cached data remains available.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const waitFor = delay => new Promise(resolve => setTimeout(resolve, delay))

export function transactionSnapshotFingerprint(transactions = []) {
  return transactions
    .map(transaction => `${transaction?.id || ''}:${transaction?.pending ? 1 : 0}:${transaction?.date || ''}:${Number(transaction?.amount) || 0}`)
    .sort()
    .join('|')
}

export async function fetchLatestPlaidTransactions({
  requestBankUpdate = false,
  fetcher = apiFetch,
  wait = waitFor,
  retryDelays = TRANSACTION_REFRESH_DELAYS_MS,
} = {}) {
  const refreshResponse = requestBankUpdate
    ? await fetcher('/plaid-transactions?refresh=1&refresh_only=1')
    : null
  const initial = await fetcher('/plaid-transactions?start_date=2000-01-01')
  const requested = Boolean(refreshResponse?.refresh?.requested)
  const accepted = Number(refreshResponse?.refresh?.accepted || 0)
  if (!requested || accepted === 0) return refreshResponse?.refresh
    ? { ...initial, refresh:refreshResponse.refresh }
    : initial

  const firstFingerprint = transactionSnapshotFingerprint(initial.transactions)
  let latest = initial
  for (const delay of retryDelays) {
    await wait(delay)
    latest = await fetcher('/plaid-transactions?start_date=2000-01-01')
    if (transactionSnapshotFingerprint(latest.transactions) !== firstFingerprint) {
      return { ...latest, refresh: { ...refreshResponse.refresh, updated: true, stillProcessing: false } }
    }
  }
  return { ...latest, refresh: { ...refreshResponse.refresh, updated: false, stillProcessing: true } }
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

export async function refreshFinanceData(storage = window.localStorage, { requestBankUpdate = false } = {}) {
  const [accountResult, transactionResult] = await Promise.allSettled([
    apiFetch('/plaid-accounts'),
    fetchLatestPlaidTransactions({ requestBankUpdate }),
  ])

  const storedFinance = loadFinanceData(storage, FINANCE_STORAGE_KEY).data
  let finance = migrateFinanceData(storedFinance)
  if (finance && finance !== storedFinance) saveFinanceData(storage, FINANCE_STORAGE_KEY, finance)
  let accounts = []
  let actuals = []
  const errors = []

  if (accountResult.status === 'fulfilled') {
    const payload = accountResult.value
    accounts = payload.accounts || []
    ;(payload.errors || []).forEach(item => errors.push(`${item.institution}: ${item.message}`))
    if (payload.connected && accounts.length && finance) {
      finance = mergePlaidBalances(finance, accounts)
      saveFinanceData(storage, FINANCE_STORAGE_KEY, finance)
    }
    if (payload.syncedAt) storage.setItem('plaid_synced_at', payload.syncedAt)
    if (payload.connected) {
      const grouped = {}
      accounts.forEach(account => {
        if (!grouped[account.itemId]) grouped[account.itemId] = { itemId: account.itemId, institution: account.institution, accounts: [] }
        grouped[account.itemId].accounts.push(account)
      })
      storage.setItem('plaid_connections', JSON.stringify(Object.values(grouped)))
    }
  } else errors.push(accountResult.reason?.message || 'Account balances could not be refreshed.')

  if (transactionResult.status === 'fulfilled') {
    const payload = transactionResult.value
    actuals = payload.transactions || []
    ;(payload.errors || []).forEach(item => errors.push(`${item.institution}: ${item.message}`))
    ;(payload.refresh?.errors || []).forEach(item => errors.push(`${item.institution}: ${item.message}`))
    storage.setItem(PLAID_ACTUALS_KEY, JSON.stringify(actuals))
  } else errors.push(transactionResult.reason?.message || 'Transactions could not be refreshed.')

  const detail = {
    finance,
    accounts,
    actuals,
    errors,
    transactionRefresh: transactionResult.status === 'fulfilled' ? transactionResult.value?.refresh || null : null,
    refreshedAt: new Date().toISOString(),
  }
  window.dispatchEvent(new CustomEvent(FINANCE_REFRESH_EVENT, { detail }))
  return detail
}

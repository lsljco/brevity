import { loadFinanceData, saveFinanceData } from './financeData.js'

export const FINANCE_STORAGE_KEY = 'lslj_finance_v9'
export const FINANCE_BUDGET_KEY = 'lslj_budget_v1'
export const PLAID_ACTUALS_KEY = 'plaid_actuals_cache'
export const FINANCE_REFRESH_EVENT = 'brevity-finance-refreshed'

const API = '/.netlify/functions'

async function apiFetch(path) {
  const response = await fetch(`${API}${path}`, { headers: { 'content-type': 'application/json' } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail || body.error || `Finance refresh failed (${response.status}).`)
  return body
}

const normalizeName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function mergePlaidBalances(financeData, plaidAccounts = []) {
  if (!financeData?.accounts?.length || !plaidAccounts.length) return financeData
  const matchedPlaidIds = new Set()
  const accounts = financeData.accounts.map(account => {
    let match = plaidAccounts.find(item => item.accountId && item.accountId === account.plaidAccountId)
    if (!match) {
      const localName = normalizeName(account.name)
      match = plaidAccounts.find(item => {
        if (matchedPlaidIds.has(item.accountId)) return false
        const plaidName = normalizeName(item.name)
        return plaidName === localName || plaidName.includes(localName) || localName.includes(plaidName)
      })
    }
    if (!match) {
      const localType = String(account.type || '').toLowerCase()
      match = plaidAccounts.find(item => {
        if (matchedPlaidIds.has(item.accountId)) return false
        const plaidType = String(item.subtype || item.type || '').toLowerCase()
        return localType === 'savings' ? plaidType === 'savings' : plaidType !== 'savings'
      })
    }
    if (!match) return account
    matchedPlaidIds.add(match.accountId)
    return { ...account, balance: match.balance, plaidAccountId: match.accountId }
  })
  return { ...financeData, accounts }
}

export async function refreshFinanceData(storage = window.localStorage) {
  const [accountResult, transactionResult] = await Promise.allSettled([
    apiFetch('/plaid-accounts'),
    apiFetch('/plaid-transactions?start_date=2026-01-01'),
  ])

  let finance = loadFinanceData(storage, FINANCE_STORAGE_KEY).data
  let accounts = []
  let actuals = []
  const errors = []

  if (accountResult.status === 'fulfilled') {
    const payload = accountResult.value
    accounts = payload.accounts || []
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
    actuals = transactionResult.value.transactions || []
    storage.setItem(PLAID_ACTUALS_KEY, JSON.stringify(actuals))
  } else errors.push(transactionResult.reason?.message || 'Transactions could not be refreshed.')

  const detail = { finance, accounts, actuals, errors, refreshedAt: new Date().toISOString() }
  window.dispatchEvent(new CustomEvent(FINANCE_REFRESH_EVENT, { detail }))
  return detail
}

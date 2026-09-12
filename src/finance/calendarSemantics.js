export function transactionsForCalendarMonth(transactions = [], year, zeroBasedMonth) {
  const numericYear = Number(year)
  const numericMonth = Number(zeroBasedMonth)
  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || numericMonth < 0 || numericMonth > 11) return []

  const monthKey = `${numericYear}-${String(numericMonth + 1).padStart(2, '0')}`
  return transactions.filter(transaction => String(transaction?.date || '').slice(0, 7) === monthKey)
}

// Plaid uses positive amounts for money leaving an account and negative
// amounts for money entering it. Every row moves the selected bank balance,
// including transfers; two sides of an in-scope transfer cancel naturally.
export function bankBalanceMovement(transactions = []) {
  const movement = -(Array.isArray(transactions) ? transactions : [])
    .reduce((sum, transaction) => sum + (Number(transaction?.amount) || 0), 0)
  return Object.is(movement, -0) ? 0 : movement
}

export function bankActivityPreview(transactions = [], limit = 2) {
  const rows = Array.isArray(transactions) ? transactions : []
  const previewLimit = Math.max(0, Math.floor(Number(limit) || 0))
  const preview = rows.slice(0, previewLimit)
  if (!preview.length || preview.some(transaction => transaction?.pending)) return preview

  const pending = rows.find(transaction => transaction?.pending)
  if (pending) preview[preview.length - 1] = pending
  return preview
}

export function cashForecastSourceSeverity({ error, freshnessStatus, balanceStatus, unmappedTransactionCount = 0 } = {}) {
  if (error) return 'error'
  if (unmappedTransactionCount > 0 || freshnessStatus !== 'fresh' || balanceStatus !== 'fresh') return 'attention'
  return 'information'
}

export function reconstructHistoricalCashBalances({ transactions = [], currentBalance = 0, todayKey = '' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(todayKey || '')) || !Number.isFinite(Number(currentBalance))) return {}
  const posted = (Array.isArray(transactions) ? transactions : [])
    .filter(transaction => !transaction?.pending && /^\d{4}-\d{2}-\d{2}$/.test(String(transaction?.date || '')) && transaction.date <= todayKey)
  if (!posted.length) return {}

  const byDate = posted.reduce((grouped, transaction) => {
    if (!grouped[transaction.date]) grouped[transaction.date] = []
    grouped[transaction.date].push(transaction)
    return grouped
  }, {})
  const earliestKey = Object.keys(byDate).sort()[0]
  const earliest = new Date(`${earliestKey}T12:00:00`)
  const cursor = new Date(`${todayKey}T12:00:00`)
  if (Number.isNaN(earliest.getTime()) || Number.isNaN(cursor.getTime()) || earliest > cursor) return {}

  const result = {}
  let runningBalance = Number(currentBalance)
  while (cursor >= earliest) {
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    // Today's source balance is intraday. Undo today's rows first; the value
    // recorded on the next loop is the preceding day's reconstructed close.
    if (dateKey < todayKey) result[dateKey] = Number(runningBalance.toFixed(2))
    runningBalance += (byDate[dateKey] || []).reduce((sum, transaction) => sum + (Number(transaction?.amount) || 0), 0)
    cursor.setDate(cursor.getDate() - 1)
  }
  return result
}

export function mappedTransactionsForBalanceReconstruction(transactions = [], plaidIdToLocal = {}) {
  return transactions.filter(transaction => Boolean(plaidIdToLocal[transaction?.accountId]))
}

export function hasCompatiblePlaidAccountLink(account = {}) {
  const localType = String(account?.type || '').trim().toLowerCase()
  const sourceType = String(account?.plaidType || '').trim().toLowerCase()
  const sourceSubtype = String(account?.plaidSubtype || '').trim().toLowerCase()
  if (localType === 'checking' || localType === 'savings') return sourceType === 'depository' && sourceSubtype === localType
  if (localType === 'credit') return sourceType === 'credit' || /credit card/.test(sourceSubtype)
  if (localType === 'investment') return sourceType === 'investment' || /brokerage|retirement/.test(sourceSubtype)
  if (localType === 'loan') return sourceType === 'loan'
  return false
}

export function buildUniquePlaidAccountMap(accounts = []) {
  const counts = new Map()
  const localIdCounts = new Map()
  accounts.forEach(account => {
    if (account?.plaidAccountId) counts.set(account.plaidAccountId, (counts.get(account.plaidAccountId) || 0) + 1)
    if (account?.id) localIdCounts.set(account.id, (localIdCounts.get(account.id) || 0) + 1)
  })
  return Object.fromEntries(accounts
    .filter(account => account?.plaidAccountId && account?.id && counts.get(account.plaidAccountId) === 1 && localIdCounts.get(account.id) === 1 && hasCompatiblePlaidAccountLink(account))
    .map(account => [account.plaidAccountId, account.id]))
}

export function hasVerifiedCashLedgerAnchors(accounts = [], plaidIdToLocal = {}) {
  if (!accounts.length) return false
  return accounts.every(account => {
    return hasCompatiblePlaidAccountLink(account)
      && Boolean(account?.plaidAccountId)
      && plaidIdToLocal[account.plaidAccountId] === account.id
      && Number.isFinite(account.plaidCurrentBalance)
  })
}

export function cashForecastScope(accounts = [], transactions = []) {
  const cashAccounts = accounts.filter(account => ['checking','savings'].includes(String(account?.type || '').toLowerCase()))
  const cashAccountIds = new Set(cashAccounts.map(account => account.id))
  const cashTransactions = transactions.filter(transaction => transaction?.type === 'transfer'
    ? cashAccountIds.has(transaction.acct) || cashAccountIds.has(transaction.transferTo)
    : cashAccountIds.has(transaction?.acct))
  return { accounts:cashAccounts, transactions:cashTransactions, accountIds:cashAccountIds }
}

// Retain each observation, including multiple observations on the same day.
function appendBalanceSnapshot(history, accounts, issuedAt) {
  const capturedAt = new Date(issuedAt).toISOString()
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(issuedAt))
  const rows = Array.isArray(history) ? history : []
  const balances = {}
  const accountCapturedAt = {}
  let changed = false
  accounts.forEach(account => {
    const id = account.plaidAccountId
    if (!id || !Number.isFinite(account.plaidCurrentBalance)) return
    balances[id] = account.plaidCurrentBalance
    accountCapturedAt[id] = capturedAt
    changed = true
  })
  if (!changed) return rows
  const observation = {date,capturedAt,kind:'intraday',balances,accountCapturedAt}
  if (rows.some(row => JSON.stringify(row) === JSON.stringify(observation))) return rows
  return [...rows,observation].sort((a,b)=>String(a.capturedAt || a.date).localeCompare(String(b.capturedAt || b.date)))
}

// Called only with server-verified staged batches, after applying the complete
// delta. Receipt replay is idempotent and balances never come from the browser.
function appendTransactionBalanceSnapshots(history, batches, transactions) {
  const rows = [...(Array.isArray(history) ? history : [])]
  const totals = new Map()
  for (const tx of transactions) if (!tx.pending && Number.isFinite(tx.amount)) {
    totals.set(tx.accountId, (totals.get(tx.accountId) || 0) - Math.round(tx.amount * 100))
  }
  for (const {pendingDelta:batch} of batches) {
    if (!Number.isFinite(Date.parse(batch.createdAt))) continue
    for (const account of batch.balanceAccounts || []) {
      if (typeof account.accountId !== 'string' || !Number.isFinite(account.current)) continue
      if (rows.some(row => row.batchId === batch.batchId && Object.hasOwn(row.balances || {},account.accountId))) continue
      const id = account.accountId
      const complete = batch.updateStatus === 'HISTORICAL_UPDATE_COMPLETE'
      const prior = rows.filter(row => row.kind === 'transaction-sync' && row.historyComplete && Number.isFinite(row.balances?.[id]) && Number.isFinite(row.postedTotals?.[id])).at(-1)
      const postedTotal = totals.get(id) || 0
      const difference = complete && prior ? (Math.round(account.current * 100) - Math.round(prior.balances[id] * 100) - (postedTotal - prior.postedTotals[id])) / 100 : null
      const capturedAt = batch.createdAt
      const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(capturedAt))
      rows.push({kind:'transaction-sync',date,capturedAt,batchId:batch.batchId,historyComplete:complete,
        balances:{[id]:account.current},availableBalances:{[id]:account.available},
        sourceUpdatedAt:account.sourceUpdatedAt || null,postedTotals:{[id]:postedTotal},
        reconciliation:{[id]:{difference,status:!complete ? 'history-loading' : difference === null ? 'baseline' : difference === 0 ? 'matched' : 'difference'}},
      })
    }
  }
  return rows
}
module.exports={appendBalanceSnapshot,appendTransactionBalanceSnapshots}

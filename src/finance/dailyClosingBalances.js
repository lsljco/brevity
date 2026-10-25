// User-recorded closes are distinct from live bank balances and transaction history.
export function scopedClosingBalances(accounts = [], records = {}) {
  if (!accounts.length) return {}
  const dates = new Set(accounts.flatMap(account => Object.keys(records[account.id] || {})))
  return Object.fromEntries([...dates].flatMap(date => {
    const rows = accounts.map(account => records[account.id]?.[date])
    if (rows.some(row => row?.source !== 'user-recorded' || !Number.isFinite(row.amount))) return []
    return [[date, rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100]]
  }))
}

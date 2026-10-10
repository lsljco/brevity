// Retain source-verified intraday observations, never promote them to bank closes.
function appendBalanceSnapshot(history, accounts, issuedAt) {
  const capturedAt = new Date(issuedAt).toISOString()
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(issuedAt))
  const balances = Object.fromEntries(accounts.filter(a => a.plaidAccountId && Number.isFinite(a.plaidCurrentBalance)).map(a => [a.plaidAccountId,a.plaidCurrentBalance]))
  const cutoff = issuedAt - 366 * 86400000
  const rows = (Array.isArray(history) ? history : []).filter(row => Date.parse(row.capturedAt) >= cutoff && row.date !== date)
  return [...rows,{date,capturedAt,kind:'intraday',balances}].sort((a,b)=>a.date.localeCompare(b.date)).slice(-366)
}
module.exports={appendBalanceSnapshot}

// Retain dated source observations. Partial checks must not erase another
// account's observation, and a rolling UI window must not delete saved history.
function appendBalanceSnapshot(history, accounts, issuedAt) {
  const capturedAt = new Date(issuedAt).toISOString()
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(issuedAt))
  const rows = Array.isArray(history) ? history : []
  const prior = rows.find(row => row.date === date)
  const balances = {...prior?.balances}
  const accountCapturedAt = Object.fromEntries(Object.keys(balances).map(id => [id,prior.accountCapturedAt?.[id] || prior.capturedAt]))
  let changed = false
  accounts.forEach(account => {
    const id = account.plaidAccountId
    if (!id || !Number.isFinite(account.plaidCurrentBalance) || Date.parse(accountCapturedAt[id] || '') > issuedAt) return
    balances[id] = account.plaidCurrentBalance
    accountCapturedAt[id] = capturedAt
    changed = true
  })
  if (!changed) return rows
  return [...rows.filter(row => row.date !== date),{date,capturedAt,kind:'intraday',balances,accountCapturedAt}].sort((a,b)=>a.date.localeCompare(b.date))
}
module.exports={appendBalanceSnapshot}

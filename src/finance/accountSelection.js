// null represents All. Account chips toggle membership without replacing peers.
export function toggleFinanceAccountSelection(previous, accountId, accounts = []) {
  const valid = new Set(accounts.map(account => account.id))
  if (!valid.has(accountId)) return previous
  const next = new Set(previous === null ? valid : [...previous].filter(id => valid.has(id)))
  if (next.has(accountId)) {
    if (next.size === 1) return next // Keep one account in view.
    next.delete(accountId)
  } else next.add(accountId)
  return next.size === valid.size ? null : next
}

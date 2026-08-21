function normalized(value) {
  return String(value ?? '').trim().toLowerCase()
}

function active(condition) {
  return Boolean(condition?.on)
}

export function transactionMatchesRule(transaction, rule, accounts = []) {
  if (!rule?.conditions) return false
  if (!rule.applyToExisting && rule.createdDate && String(transaction.date || '') < rule.createdDate) return false

  const conditions = rule.conditions
  if (active(conditions.originalStatement)) {
    const source = normalized(transaction.originalStatement || transaction.original_description || transaction.name)
    if (!source.includes(normalized(conditions.originalStatement.value))) return false
  }
  if (active(conditions.merchantName)) {
    const source = normalized(transaction.name || transaction.merchant_name)
    const value = normalized(conditions.merchantName.value)
    const mode = conditions.merchantName.match || 'exactly'
    if (mode === 'contains' && !source.includes(value)) return false
    if (mode === 'starts' && !source.startsWith(value)) return false
    if (mode === 'exactly' && source !== value) return false
  }
  if (active(conditions.amount)) {
    const amount = Math.abs(Number(transaction.amount) || 0)
    if (conditions.amount.min !== '' && amount < Number(conditions.amount.min)) return false
    if (conditions.amount.max !== '' && amount > Number(conditions.amount.max)) return false
  }
  if (active(conditions.categories) && normalized(transaction.category || transaction.cat) !== normalized(conditions.categories.value)) return false
  if (active(conditions.accounts)) {
    const selected = String(conditions.accounts.value || '')
    const local = accounts.find(account => String(account.id) === selected)
    const accepted = new Set([selected, String(local?.plaidAccountId || '')].filter(Boolean))
    if (!accepted.has(String(transaction.accountId || transaction.acct || ''))) return false
  }
  return true
}

export function applyTransactionRule(transaction, rule, accounts = []) {
  if (!transactionMatchesRule(transaction, rule, accounts)) return transaction
  const actions = rule.actions || {}
  const next = { ...transaction }
  if (active(actions.renameMerchant) && actions.renameMerchant.value) next.name = actions.renameMerchant.value.trim()
  if (active(actions.updateCategory) && actions.updateCategory.value) next.category = actions.updateCategory.value.trim()
  if (active(actions.addTags) && actions.addTags.value) {
    const tags = Array.isArray(next.tags) ? next.tags : String(next.tags || '').split(',')
    next.tags = [...new Set([...tags, ...String(actions.addTags.value).split(',')].map(tag => tag.trim()).filter(Boolean))]
  }
  if (active(actions.hideTransaction)) next._deleted = true
  if (active(actions.reviewStatus)) next.needsReview = actions.reviewStatus.value || 'Anyone'
  if (active(actions.linkGoal) && actions.linkGoal.value) next.goal = actions.linkGoal.value.trim()
  if (Array.isArray(rule.splits) && rule.splits.length) {
    next.splits = rule.splits.map(split => ({ ...split, cat: String(split.cat || '').trim(), amount: Number(split.amount) || 0 }))
  }
  return next
}

export function applyTransactionRules(transaction, rules = [], accounts = []) {
  return rules.reduce((current, rule) => applyTransactionRule(current, rule, accounts), transaction)
}

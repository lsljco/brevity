export function summarizeActuals(transactions = [], year = new Date().getFullYear()) {
  const months = Array.from({ length: 12 }, (_, month) => ({ month, income: 0, expenses: 0, net: 0 }))
  const expensesByCategory = {}
  const vendorSpend = {}
  transactions.forEach(transaction => {
    const date = new Date(`${transaction.date}T12:00:00`)
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) return
    const amount = Number(transaction.amount) || 0
    const bucket = months[date.getMonth()]
    if (amount < 0) bucket.income += Math.abs(amount)
    else {
      bucket.expenses += amount
      const category = transaction.category || transaction.cat || 'Uncategorized'
      expensesByCategory[category] = (expensesByCategory[category] || 0) + amount
      const vendor = transaction.merchant_name || transaction.name || 'Unknown vendor'
      vendorSpend[vendor] = (vendorSpend[vendor] || 0) + amount
    }
    bucket.net = bucket.income - bucket.expenses
  })
  const income = months.reduce((sum, month) => sum + month.income, 0)
  const expenses = months.reduce((sum, month) => sum + month.expenses, 0)
  return {
    months,
    income,
    expenses,
    net: income - expenses,
    margin: income ? ((income - expenses) / income) * 100 : 0,
    expensesByCategory: Object.entries(expensesByCategory).sort((a,b) => b[1] - a[1]),
    vendorSpend: Object.entries(vendorSpend).sort((a,b) => b[1] - a[1]),
  }
}

export function buildBalanceSheet(accounts = []) {
  const assetTypes = new Set(['checking', 'savings', 'investment', 'cash'])
  const liabilityTypes = new Set(['credit', 'loan', 'debt'])
  const assets = accounts.filter(account => assetTypes.has(account.type)).map(account => ({ ...account, reportBalance: Number(account.balance) || 0 }))
  const liabilities = accounts.filter(account => liabilityTypes.has(account.type)).map(account => ({ ...account, reportBalance: Math.abs(Number(account.balance) || 0) }))
  const totalAssets = assets.reduce((sum, account) => sum + account.reportBalance, 0)
  const totalLiabilities = liabilities.reduce((sum, account) => sum + account.reportBalance, 0)
  return { assets, liabilities, totalAssets, totalLiabilities, equity: totalAssets - totalLiabilities }
}

export function transactionDirection(transaction) {
  return Number(transaction?.amount) < 0 ? 'income' : 'expense'
}

export function categoryGroup(category = '') {
  const value = String(category).toLowerCase()
  if (/income|paycheck|deposit|interest/.test(value)) return 'Income'
  if (/food|drink|grocer|restaurant|coffee/.test(value)) return 'Food & Dining'
  if (/home|mortgage|rent|utility|electric|water|gas/.test(value)) return 'Housing'
  if (/shop|merchandise|clothing|electronic/.test(value)) return 'Shopping'
  if (/health|medical|doctor|dental|pharmacy/.test(value)) return 'Health & Wellness'
  if (/auto|transport|fuel|parking|rideshare/.test(value)) return 'Auto & Transport'
  if (/insurance/.test(value)) return 'Insurance'
  if (/subscription|streaming/.test(value)) return 'Subscriptions'
  if (/education|tuition|book/.test(value)) return 'Education'
  if (/saving|invest/.test(value)) return 'Savings & Investments'
  if (/transfer|payment/.test(value)) return 'Transfers'
  return 'Other'
}

export function reportKey(transaction, displayBy = 'category') {
  if (displayBy === 'merchant') return transaction.merchant_name || transaction.name || 'Unknown merchant'
  const category = String(transaction.category || transaction.cat || 'Uncategorized')
  return displayBy === 'group' ? categoryGroup(category) : category
}

export function groupReportTransactions(transactions = [], direction = 'expense', displayBy = 'category') {
  const rows = new Map()
  transactions.filter(transaction => transactionDirection(transaction) === direction).forEach(transaction => {
    const key = reportKey(transaction, displayBy)
    const current = rows.get(key) || { name: key, amount: 0, transactions: [] }
    current.amount += Math.abs(Number(transaction.amount) || 0)
    current.transactions.push(transaction)
    rows.set(key, current)
  })
  return [...rows.values()].sort((a, b) => b.amount - a.amount)
}

export function reportStats(transactions = [], direction = 'expense') {
  const rows = transactions.filter(transaction => transactionDirection(transaction) === direction)
  const total = rows.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0)
  const largest = rows.reduce((max, transaction) => Math.max(max, Math.abs(Number(transaction.amount) || 0)), 0)
  return { total, count: rows.length, largest, average: rows.length ? total / rows.length : 0 }
}

export function matchesTransactionFilter(transaction, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true
  if (filter.ids?.length && !filter.ids.includes(transaction.id)) return false
  if (filter.direction && transactionDirection(transaction) !== filter.direction) return false
  if (filter.displayBy && filter.value && reportKey(transaction, filter.displayBy) !== filter.value) return false
  if (filter.budgetCategory && budgetCategoryForTransaction(transaction) !== filter.budgetCategory) return false
  return true
}

export function budgetCategoryForTransaction(transaction) {
  if (transactionDirection(transaction) === 'income') return 'Income'
  const raw = String(transaction.category || transaction.cat || '').toLowerCase().replaceAll('_', ' ')
  if (/transfer|credit card payment/.test(raw)) return null
  if (/utilit|electric|water|internet|phone|cable/.test(raw)) return 'Utilities'
  if (/mortgage|rent|home|housing/.test(raw)) return 'Housing'
  if (/auto|transport|fuel|gas station|parking|rideshare/.test(raw)) return 'Transportation'
  if (/insurance/.test(raw)) return 'Insurance'
  if (/health|medical|doctor|dental|pharmacy/.test(raw)) return 'Health'
  if (/loan|debt|interest|bank fee/.test(raw)) return 'Debt'
  if (/food|drink|grocer|restaurant|coffee/.test(raw)) return 'Food'
  if (/subscription|streaming/.test(raw)) return 'Subscriptions'
  if (/child|family|education|tuition|school/.test(raw)) return 'Family'
  if (/home improvement|household/.test(raw)) return 'Household'
  if (/shop|merchandise|entertainment|personal care|travel/.test(raw)) return 'Discretionary'
  return 'Other'
}

export function summarizeBudgetActuals(transactions = []) {
  return transactions.reduce((summary, transaction) => {
    const category = budgetCategoryForTransaction(transaction)
    if (!category) return summary
    const amount = Math.abs(Number(transaction.amount) || 0)
    summary[category] = (summary[category] || 0) + amount
    return summary
  }, {})
}

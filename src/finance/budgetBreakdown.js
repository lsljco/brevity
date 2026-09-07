import { calculateTransactionAmountForMonth } from './monthlyCashFlow.js'

export function buildBudgetCategoryItems(transactions = []) {
  const categoryOrder = ['Housing','Utilities','Transportation','Insurance','Health','Debt','Food','Household','Family','Subscriptions','Discretionary','Other']
  const recurring = transactions.filter(transaction => transaction.freq !== 'once' && transaction.type !== 'transfer')
  const result = {}
  const income = [...new Set(recurring.filter(transaction => transaction.type === 'income').map(transaction => transaction.name).filter(Boolean))]
  if (income.length) result.Income = income

  const expenses = {}
  for (const transaction of recurring.filter(transaction => transaction.type === 'expense')) {
    const category = transaction.cat || 'Other'
    if (!expenses[category]) expenses[category] = []
    if (transaction.name && !expenses[category].includes(transaction.name)) expenses[category].push(transaction.name)
  }
  categoryOrder.forEach(category => { if (expenses[category]) result[category] = expenses[category] })
  Object.keys(expenses).filter(category => !categoryOrder.includes(category)).sort().forEach(category => { result[category] = expenses[category] })
  return result
}

export function buildBudgetBreakdown({ transactions = [], budget = {}, month = new Date(), direction }) {
  const monthIndex = month.getMonth()
  const monthDate = `${month.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}-01`
  const matching = transactions.filter(transaction => (
    transaction?.type === direction
    && transaction.freq !== 'once'
    && transaction.type !== 'transfer'
  ))
  const grouped = new Map()

  for (const transaction of matching) {
    const name = String(transaction.name || '').trim()
    if (!name) continue
    if (!grouped.has(name)) grouped.set(name, { category: transaction.cat || 'Other', transactions: [] })
    grouped.get(name).transactions.push(transaction)
  }

  return [...grouped.entries()].map(([name, group]) => {
    const override = budget[name]?.[monthIndex]
    const amount = override !== undefined && override !== null && override !== ''
      ? Number(override) || 0
      : group.transactions.reduce((sum, transaction) => (
          sum + calculateTransactionAmountForMonth(transaction, month, { recurringOnly: true })
        ), 0)
    return {
      id: `budget-${direction}-${name}`,
      name,
      type: direction,
      cat: group.category,
      freq: 'budgeted',
      amount,
      date: monthDate,
      budgetLine: true,
    }
  }).filter(line => line.amount !== 0)
}

export function budgetBreakdownTotal(lines = []) {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
}

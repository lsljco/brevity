import { parseISODate, txOccursOnDate } from './projection.js'

function money(value) {
  const amount = Math.abs(Number(value) || 0)
  return Number.isFinite(amount) ? amount : 0
}

function monthAnchor(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value)
  return parseISODate(value) || new Date()
}

export function selectOperatingTransactions(accounts = [], transactions = []) {
  const operatingIds = new Set(['a1'])
  for (const account of accounts) {
    if (/\boperating\s+account\b/i.test(String(account?.name || ''))) operatingIds.add(account.id)
  }
  return transactions.filter(transaction => operatingIds.has(transaction?.acct))
}

export function calculateTransactionAmountForMonth(transaction, month = new Date(), { recurringOnly = false } = {}) {
  if (!transaction || transaction.type === 'transfer' || (recurringOnly && transaction.freq === 'once')) return 0
  const selectedMonth = monthAnchor(month)
  const year = selectedMonth.getFullYear()
  const monthIndex = selectedMonth.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  let total = 0

  for (let day = 1; day <= daysInMonth; day += 1) {
    if (txOccursOnDate(transaction, new Date(year, monthIndex, day))) total += money(transaction.amount)
  }
  return total
}

export function calculateScheduledTotalsForMonth(transactions = [], month = new Date(), { recurringOnly = false } = {}) {
  let income = 0
  let expenses = 0
  for (const transaction of transactions) {
    const amount = calculateTransactionAmountForMonth(transaction, month, { recurringOnly })
    if (transaction?.type === 'income') income += amount
    else if (transaction?.type === 'expense') expenses += amount
  }
  return { income, expenses, net: income - expenses }
}

/**
 * Calculate scheduled recurring cash flow for one calendar month.
 *
 * Each real occurrence is counted, so partial-month starts and ends, skipped
 * dates, and five-paycheck months are reflected without frequency estimates.
 * Transfers and one-time items are excluded from the recurring calculation.
 */
export function calculateMonthlyCashFlow(transactions = [], month = new Date()) {
  const totals = calculateScheduledTotalsForMonth(transactions, month, { recurringOnly: true })

  return {
    income: totals.income,
    recurringExpenses: totals.expenses,
    cashFlow: totals.net,
  }
}

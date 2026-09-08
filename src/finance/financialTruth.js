import { isTransferTransaction, transactionDirection } from './reportingData.js'

const MERCHANT_STOP_WORDS = new Set(['inc', 'llc', 'corp', 'corporation', 'company', 'co', 'payment', 'autopay', 'online'])

export function normalizeMerchantName(transaction) {
  return String(transaction?.merchant_name || transaction?.name || transaction?.originalStatement || transaction?.original_description || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(token => token && !MERCHANT_STOP_WORDS.has(token))
    .join(' ')
}

function sameMerchant(left, right) {
  const a = normalizeMerchantName(left), b = normalizeMerchantName(right)
  return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)))))
}

export function findPossibleRecurringDuplicates(transactions = []) {
  const candidates = transactions.filter(transaction => (
    transaction?.type === 'expense' && transaction?.freq === 'monthly' && !isTransferTransaction(transaction)
  ))
  const pairs = []
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex], right = candidates[rightIndex]
      const leftAmount = Math.abs(Number(left.amount) || 0), rightAmount = Math.abs(Number(right.amount) || 0)
      const tolerance = Math.max(2, Math.max(leftAmount, rightAmount) * 0.02)
      if (!sameMerchant(left, right) || Math.abs(leftAmount - rightAmount) > tolerance) continue
      pairs.push({ left, right, confidence: left.acct && right.acct && left.acct === right.acct ? 'high' : 'medium' })
    }
  }
  return pairs
}

export function summarizeActualActivity(transactions = []) {
  const rows = transactions.filter(transaction => !transaction?.pending && !isTransferTransaction(transaction))
  const expenses = rows.filter(transaction => transactionDirection(transaction) === 'expense')
  const income = rows.filter(transaction => transactionDirection(transaction) === 'income')
  const spent = expenses.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0)
  const received = income.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0)
  const largestExpense = [...expenses].sort((a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0))[0] || null
  return { rows, expenses, income, spent, received, net: received - spent, largestExpense }
}

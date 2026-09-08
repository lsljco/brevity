import { transactionOccurrencesForRange } from './monthlyCashFlow.js'

export const DEFAULT_TRANSACTION_LIST_OPTIONS = Object.freeze({
  sortBy: 'amount',
  sortDirection: 'desc',
  description: '',
  minAmount: '',
  maxAmount: '',
  dateFrom: '',
  dateTo: '',
})

export const transactionDescription = transaction => String(
  transaction?.originalStatement
    || transaction?.original_description
    || transaction?.description
    || transaction?.name
    || transaction?.merchant_name
    || '',
).trim()

export const transactionVisibleName = transaction => String(
  transaction?.name
    || transaction?.merchant_name
    || transaction?.description
    || transactionDescription(transaction)
    || '',
).trim()

const transactionSearchText = transaction => [
  transactionVisibleName(transaction),
  transactionDescription(transaction),
  transaction?.originalStatement,
  transaction?.original_description,
].filter(Boolean).join(' ').toLocaleLowerCase()

// Scheduled drill-down rows carry `rangeAmount`, which is the total of every
// occurrence in the selected timeframe. Use the same amount the row displays
// for amount filtering and sorting; posted transactions continue to use their
// single `amount` value.
export const transactionAmount = transaction => Math.abs(Number(transaction?.rangeAmount ?? transaction?.amount) || 0)

const transactionOccurrenceDates = transaction => Array.isArray(transaction?.rangeOccurrences)
  ? transaction.rangeOccurrences.map(occurrence => String(occurrence?.date || '').slice(0, 10)).filter(Boolean).sort()
  : []

export const transactionDate = transaction => String(
  transactionOccurrenceDates(transaction)[0] || transaction?.date || transaction?.start || transaction?.scheduledDate || '',
).slice(0, 10)

const numericFilter = value => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.abs(parsed) : null
}

export function sortAndFilterTransactions(transactions = [], options = {}) {
  const settings = { ...DEFAULT_TRANSACTION_LIST_OPTIONS, ...options }
  const description = String(settings.description || '').trim().toLocaleLowerCase()
  const minAmount = numericFilter(settings.minAmount)
  const maxAmount = numericFilter(settings.maxAmount)
  const direction = settings.sortDirection === 'asc' ? 1 : -1

  return [...transactions]
    .map(transaction => {
      if (!Array.isArray(transaction?.rangeOccurrences) || (!settings.dateFrom && !settings.dateTo)) return transaction
      const rangeOccurrences = transaction.rangeOccurrences.filter(occurrence => {
        const date = String(occurrence?.date || '').slice(0, 10)
        if (!date) return false
        if (settings.dateFrom && date < settings.dateFrom) return false
        if (settings.dateTo && date > settings.dateTo) return false
        return true
      })
      if (!rangeOccurrences.length) return null
      return {
        ...transaction,
        rangeOccurrences,
        rangeAmount: rangeOccurrences.reduce((total, occurrence) => total + Math.abs(Number(occurrence.amount) || 0), 0),
        occurrenceCount: rangeOccurrences.length,
      }
    })
    .filter(transaction => {
      if (!transaction) return false
      const amount = transactionAmount(transaction)
      const date = transactionDate(transaction)
      if (description && !transactionSearchText(transaction).includes(description)) return false
      if (minAmount !== null && amount < minAmount) return false
      if (maxAmount !== null && amount > maxAmount) return false
      if (settings.dateFrom && (!date || date < settings.dateFrom)) return false
      if (settings.dateTo && (!date || date > settings.dateTo)) return false
      return true
    })
    .sort((left, right) => {
      let comparison = 0
      if (settings.sortBy === 'description') comparison = transactionVisibleName(left).localeCompare(transactionVisibleName(right), undefined, { sensitivity: 'base' })
      else if (settings.sortBy === 'date') {
        const leftDates = transactionOccurrenceDates(left)
        const rightDates = transactionOccurrenceDates(right)
        const leftDate = direction > 0 ? leftDates[0] || transactionDate(left) : leftDates.at(-1) || transactionDate(left)
        const rightDate = direction > 0 ? rightDates[0] || transactionDate(right) : rightDates.at(-1) || transactionDate(right)
        comparison = leftDate.localeCompare(rightDate)
      }
      else comparison = transactionAmount(left) - transactionAmount(right)
      if (comparison === 0) comparison = transactionVisibleName(left).localeCompare(transactionVisibleName(right), undefined, { sensitivity: 'base' })
      return comparison * direction
    })
}

export function buildScheduledTransactionRows(transactions = [], financeRange, transactionFilter = null, listOptions = {}) {
  const filter = transactionFilter || {}
  const source = filter.budgetLines || transactions
  const rows = source.map(transaction => {
    if (filter.budgetLines) return transaction
    const range = filter.range || financeRange
    const rangeOccurrences = transactionOccurrencesForRange(transaction, range, { recurringOnly:Boolean(filter.recurringOnly) })
    return {
      ...transaction,
      rangeOccurrences,
      rangeAmount:rangeOccurrences.reduce((total, occurrence) => total + occurrence.amount, 0),
      occurrenceCount:rangeOccurrences.length,
    }
  }).filter(transaction => {
    if (!filter.budgetLines && !transaction.rangeAmount) return false
    if (!filter.scheduled) return true
    if (filter.ids?.length && !filter.ids.includes(transaction.id)) return false
    if (filter.direction && transaction.type !== filter.direction) return false
    if (filter.value && filter.displayBy === 'category' && transaction.cat !== filter.value) return false
    return true
  })
  return sortAndFilterTransactions(rows, listOptions)
}

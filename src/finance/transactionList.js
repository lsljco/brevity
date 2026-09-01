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
  transaction?.name || transaction?.description || transaction?.merchant_name || '',
).trim()

export const transactionAmount = transaction => Math.abs(Number(transaction?.amount) || 0)

export const transactionDate = transaction => String(
  transaction?.date || transaction?.start || transaction?.scheduledDate || '',
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
    .filter(transaction => {
      const amount = transactionAmount(transaction)
      const date = transactionDate(transaction)
      if (description && !transactionDescription(transaction).toLocaleLowerCase().includes(description)) return false
      if (minAmount !== null && amount < minAmount) return false
      if (maxAmount !== null && amount > maxAmount) return false
      if (settings.dateFrom && (!date || date < settings.dateFrom)) return false
      if (settings.dateTo && (!date || date > settings.dateTo)) return false
      return true
    })
    .sort((left, right) => {
      let comparison = 0
      if (settings.sortBy === 'description') comparison = transactionDescription(left).localeCompare(transactionDescription(right), undefined, { sensitivity: 'base' })
      else if (settings.sortBy === 'date') comparison = transactionDate(left).localeCompare(transactionDate(right))
      else comparison = transactionAmount(left) - transactionAmount(right)
      if (comparison === 0) comparison = transactionDescription(left).localeCompare(transactionDescription(right), undefined, { sensitivity: 'base' })
      return comparison * direction
    })
}

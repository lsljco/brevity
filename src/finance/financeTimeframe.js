export const TIMEFRAME_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['tomorrow', 'Tomorrow'],
  ['this-week', 'This Week'], ['last-week', 'Last Week'], ['next-week', 'Next Week'],
  ['this-month', 'This Month'], ['last-month', 'Last Month'], ['next-month', 'Next Month'],
  ['last-3-months', 'Last 3 Months'], ['last-6-months', 'Last 6 Months'],
  ['year-to-date', 'Year to Date'], ['last-12-months', 'Last 12 Months'],
  ['this-year', 'This Year'], ['last-year', 'Last Year'], ['all-time', 'All Time'],
  ['custom', 'Custom'],
]

export function isoDate(date) {
  const y = date.getFullYear()
  return `${y}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function add(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function resolveTimeframe(preset = 'last-12-months', now = new Date(), custom = {}) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let from = new Date(today), to = new Date(today)
  if (preset === 'yesterday') from = to = add(today, -1)
  else if (preset === 'tomorrow') from = to = add(today, 1)
  else if (preset === 'this-week') {
    from = add(today, -today.getDay())
    to = add(from, 6)
  } else if (preset === 'last-week') {
    to = add(today, -today.getDay() - 1)
    from = add(to, -6)
  } else if (preset === 'next-week') {
    from = add(today, 7 - today.getDay())
    to = add(from, 6)
  } else if (preset === 'this-month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1)
  }
  else if (preset === 'last-month') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    to = new Date(today.getFullYear(), today.getMonth(), 0)
  } else if (preset === 'next-month') {
    from = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    to = new Date(today.getFullYear(), today.getMonth() + 2, 0)
  } else if (preset === 'last-3-months') from = add(today, -89)
  else if (preset === 'last-6-months') from = add(today, -181)
  else if (preset === 'year-to-date' || preset === 'this-year') from = new Date(today.getFullYear(), 0, 1)
  else if (preset === 'last-12-months') from = add(today, -364)
  else if (preset === 'last-year') {
    from = new Date(today.getFullYear() - 1, 0, 1)
    to = new Date(today.getFullYear() - 1, 11, 31)
  } else if (preset === 'all-time') {
    from = new Date(2000, 0, 1)
    to = new Date(2100, 11, 31)
  } else if (preset === 'custom') {
    from = custom.from ? new Date(`${custom.from}T12:00:00`) : from
    to = custom.to ? new Date(`${custom.to}T12:00:00`) : to
  }
  return { preset, from: isoDate(from), to: isoDate(to) }
}

export function transactionInTimeframe(transaction, range) {
  const date = transaction?.date || transaction?.start
  return Boolean(date && date >= range.from && date <= range.to)
}

export function filterTransactionsByTimeframe(transactions = [], range) {
  return transactions.filter(transaction => transactionInTimeframe(transaction, range))
}

export function timeframeLabel(range) {
  const fmt = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(range.from)} – ${fmt(range.to)}`
}

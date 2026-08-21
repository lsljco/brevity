// projection.js — Balance projection engine
// Given a list of accounts and scheduled transactions, computes
// the projected balance for every day over the next N days.

export function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function today0() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function fmtMoney(n) {
  const abs = Math.abs(n)
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtK(n) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  return abs >= 10000 ? sign + '$' + (abs / 1000).toFixed(1) + 'k' : sign + '$' + Math.round(abs).toLocaleString()
}

export function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function calendarDayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
}

function calendarTransactionOrder(a, b) {
  const rank = tx => tx.type === 'income' ? 0 : tx.type === 'transfer' ? 1 : 2
  const rankDelta = rank(a) - rank(b)
  if (rankDelta) return rankDelta
  return String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''), undefined, { sensitivity:'base' })
}

export function txOccursOnDate(tx, d) {
  const start = parseISODate(tx.start)
  if (!start) return false
  const dateDay = calendarDayNumber(d)
  const startDay = calendarDayNumber(start)
  if (dateDay < startDay) return false
  if (tx.end && tx.end !== '') {
    const end = parseISODate(tx.end)
    if (end && dateDay > calendarDayNumber(end)) return false
  }
  // Skip individual overridden occurrences (created by drag-and-drop)
  if (tx.skips?.includes(toISO(d))) return false
  const dom = d.getDate()
  const sdm = start.getDate()

  switch (tx.freq) {
    case 'once':       return toISO(d) === tx.start
    case 'daily':      return true
    case 'weekly': {
      const diff = dateDay - startDay
      return diff >= 0 && diff % 7 === 0
    }
    case 'biweekly': {
      const diff = dateDay - startDay
      return diff >= 0 && diff % 14 === 0
    }
    case 'semimonthly': return dom === 1 || dom === 15
    case 'monthly':     return dom === sdm
    case 'quarterly': {
      const md = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth()
      return md >= 0 && md % 3 === 0 && dom === sdm
    }
    case 'yearly': return d.getMonth() === start.getMonth() && dom === sdm
    default: return false
  }
}

export function buildProjection(accounts, transactions, days = 365, overrides = {}, pastDays = 365, todayAnchor = null) {
  const currentBal = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0)
  const acctIdSet  = new Set(accounts.map(a => a.id))
  const map = new Map()
  const t = today0()
  const todayStr0  = toISO(t)
  const startDate = addDays(t, -pastDays)

  // Compute transfer delta for a single transaction given the accounts in scope.
  // - Source in scope, dest out of scope → outflow (negative)
  // - Dest in scope, source out of scope → inflow (positive)
  // - Both or neither in scope → net zero
  function transferDelta(tx) {
    const srcIn = acctIdSet.has(tx.acct)
    const dstIn = acctIdSet.has(tx.transferTo)
    if (srcIn && !dstIn) return -parseFloat(tx.amount || 0)
    if (!srcIn && dstIn) return  parseFloat(tx.amount || 0)
    return 0
  }

  // Reconstruct the starting balance by summing all scheduled transaction deltas
  // that occur between startDate and yesterday. Since we know today's starting
  // balance (currentBal), we subtract those past deltas to arrive at what the
  // balance was at the beginning of startDate.
  let pastDelta = 0
  for (let i = 0; i < pastDays; i++) {
    const d = addDays(startDate, i)
    const hits = transactions.filter(tx => txOccursOnDate(tx, d)).sort(calendarTransactionOrder)
    pastDelta += hits.reduce((s, tx) => {
      if (tx.type === 'transfer') return s + transferDelta(tx)
      return s + (tx.type === 'income' ? 1 : -1) * parseFloat(tx.amount || 0)
    }, 0)
  }

  // Forward pass: project from startDate through today + future days
  let bal = currentBal - pastDelta
  for (let i = 0; i <= pastDays + days; i++) {
    const d = addDays(startDate, i)
    const dateStr = toISO(d)
    const hits = transactions.filter(tx => txOccursOnDate(tx, d)).sort(calendarTransactionOrder)
    const delta = hits.reduce((s, tx) => {
      if (tx.type === 'transfer') return s + transferDelta(tx)
      return s + (tx.type === 'income' ? 1 : -1) * parseFloat(tx.amount || 0)
    }, 0)
    bal += delta
    // Anchor today to the real Plaid balance so future projections start from a known-correct value.
    // This eliminates the visual "jump" caused by mismatches between scheduled and actual past transactions.
    if (dateStr === todayStr0 && todayAnchor !== null) bal = todayAnchor
    // Balance override: user can pin any date to an exact number; projection continues from there
    if (overrides[dateStr] !== undefined) bal = overrides[dateStr]
    map.set(dateStr, {
      bal: parseFloat(bal.toFixed(2)),
      delta,
      txns: hits,
      isOverridden: overrides[dateStr] !== undefined,
    })
  }
  return map
}

import { buildUniquePlaidAccountMap } from './calendarSemantics.js'

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const cents = value => Math.round(value * 100)
const nextDay = value => new Date(Date.parse(`${value}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)

// Reconstruct estimates from dated evidence, never from budget occurrences.
// An intraday bank observation is not a certified closing balance: same-day
// posting order and gaps in the bank feed can cause differences from statements.
export function buildDatedCashLedger({ accounts = [], transactions = [], balanceHistory = [], closingRecords = {}, today, legacyAnchorDate = '' } = {}) {
  if (!validDate(today) || !accounts.length) return { balances:{}, forecastAccounts:accounts, sources:[] }
  const links = buildUniquePlaidAccountMap(accounts)
  const posted = [...new Map(transactions.filter(row => row?.id && !row.pending && validDate(row.date) && row.date <= today && Number.isFinite(row.amount)).map(row => [row.id, row])).values()]
  const oldestActivity = posted.map(row => row.date).sort()[0]
  const sources = []
  const perAccount = accounts.map(account => {
    const bankId = links[account.plaidAccountId] === account.id ? account.plaidAccountId : null
    const rows = bankId ? posted.filter(row => row.accountId === bankId) : []
    const movement = new Map()
    rows.forEach(row => movement.set(row.date, (movement.get(row.date) || 0) - cents(row.amount)))
    const anchors = bankId ? balanceHistory.filter(row => validDate(row.date) && row.date <= today && Number.isFinite(row.balances?.[bankId])).map(row => ({ date:row.date, amount:cents(row.balances[bankId]), kind:'bank', capturedAt:row.accountCapturedAt?.[bankId] || row.capturedAt || '' })) : []
    // Migration fallback uses the saved successful source date, never today's
    // date or the timestamp of a failed refresh attempt.
    if (!anchors.length && bankId && !balanceHistory.length && validDate(legacyAnchorDate) && legacyAnchorDate <= today && Number.isFinite(account.plaidCurrentBalance)) anchors.push({date:legacyAnchorDate,amount:cents(account.plaidCurrentBalance),kind:'bank',capturedAt:''})
    Object.entries(closingRecords[account.id] || {}).forEach(([date, row]) => {
      if (validDate(date) && date <= today && row?.source === 'user-recorded' && Number.isFinite(row.amount)) anchors.push({date,amount:cents(row.amount),kind:'recorded',capturedAt:row.recordedAt || ''})
    })
    anchors.sort((a,b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.capturedAt.localeCompare(b.capturedAt) : a.kind === 'recorded' ? 1 : -1))
    const byDate = new Map(anchors.map(anchor => [anchor.date, anchor]))
    const ordered = [...byDate.values()]
    if (!ordered.length) {
      sources.push({id:account.id, name:account.name, anchorDate:null, postedCount:rows.length})
      return {balances:{}, forecastAccount:account}
    }
    const first = [oldestActivity, ordered[0].date].filter(Boolean).sort()[0]
    const latest = ordered.at(-1)
    sources.push({id:account.id,name:account.name,anchorDate:latest.date,anchorKind:latest.kind,postedCount:rows.length,firstActivity:rows.map(row => row.date).sort()[0] || null})
    // Prefix sums allow both forward and backward reconstruction without
    // quadratic scans. Transfer legs naturally cancel when both are selected.
    const prefix = new Map()
    let total = 0
    for (let date = first; date <= today; date = nextDay(date)) {
      total += movement.get(date) || 0
      prefix.set(date, total)
    }
    const at = (anchor, date) => anchor.amount + prefix.get(date) - prefix.get(anchor.date)
    const balances = {}
    let chosen = ordered[0], index = 0
    for (let date = first; date < today; date = nextDay(date)) {
      while (index < ordered.length && ordered[index].date <= date) chosen = ordered[index++]
      balances[date] = at(chosen, date) / 100
    }
    // Keep today's bank available balance (including its holds) authoritative.
    // Older observations are rolled forward using posted rows; old available
    // holds must not be carried into today's separate pending adjustments.
    let forecastAccount = account
    if (latest.date < today) {
      const amount = at(latest, today) / 100
      forecastAccount = {...account,balance:amount,plaidCurrentBalance:bankId ? amount : undefined,plaidAvailableBalance:undefined}
    }
    return {balances,forecastAccount}
  })
  const dates = new Set(perAccount.flatMap(row => Object.keys(row.balances)))
  const balances = Object.fromEntries([...dates].filter(date => perAccount.every(row => Number.isFinite(row.balances[date]))).map(date => [date, perAccount.reduce((sum,row) => sum + cents(row.balances[date]),0) / 100]))
  return {balances,forecastAccounts:perAccount.map(row => row.forecastAccount),sources,estimatedAnchor:perAccount.some((row,index) => row.forecastAccount !== accounts[index])}
}

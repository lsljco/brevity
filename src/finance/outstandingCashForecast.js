import {applyBudgetAllowances} from './budgetAllowances.js'
import { buildProjection, today0, toISO, parseISODate, addDays } from './projection.js'
import { buildUniquePlaidAccountMap } from './calendarSemantics.js'
import { normalizeMerchantName } from './financialTruth.js'
import { approvedReconciliationMatches } from './autoReconciliation.js'

const cents = value => Math.round(Number(value || 0) * 100)
const dayNumber = date => Date.parse(`${date}T12:00:00Z`) / 86400000
const genericIncomeWords = new Set(['income','payroll','severance','salary','deposit','transfer','payment','credit','debit','funds','direct','bank','checking','savings','account','pending','telephone','online','monthly','weekly','family','household','larry','lorenzo','terica','nyla','javin','isaiah'])
function sameIncomeSource(plan, actual) {
  const words = normalizeMerchantName(plan).split(' ').filter(word => word.length >= 4 && !genericIncomeWords.has(word) && !/\d/.test(word))
  if (!words.length) return false
  return [actual.name,actual.merchant_name,actual.originalStatement,actual.original_description].filter(Boolean).some(name => {
    const tokens = normalizeMerchantName({name}).split(' ')
    const phrases = new Set(tokens.flatMap((word,index) => [word,tokens.slice(index,index+2).join(''),tokens.slice(index,index+3).join('')]))
    return words.every(word => phrases.has(word))
  })
}

// Generic household labels can lack an employer name. Only an exact same-day
// payroll credit is eligible; the one-to-one edge check below rejects ambiguity.
function genericPayrollMatch(plan, actual) {
  const words = normalizeMerchantName(plan).split(' ').filter(word => word.length >= 4 && !genericIncomeWords.has(word))
  const description = [actual.name, actual.originalStatement, actual.original_description].filter(Boolean).join(' ').toLowerCase()
  return plan.type === 'income' && words.length === 0
    && /\b(payroll|salary)\b/.test(description)
    && !/\b(transfer|refund|reversal)\b/.test(description)
}

// Read-only realization of individual occurrences. Bank IDs are consumed once;
// amount/date alone never establishes that a scheduled payment has cleared.
export function buildOutstandingCashForecast(accounts, transactions, actuals = [], options = {}) {
  if (!accounts.length) return new Map()
  const today = options.today || toISO(today0())
  const accountMap = buildUniquePlaidAccountMap(accounts)
  const ids = new Set(accounts.map(account => account.id))
  const ledgerIds = new Set(accounts.filter(account => Object.values(accountMap).includes(account.id) && Number.isFinite(account.plaidCurrentBalance)).map(account => account.id))
  const current = accounts.reduce((sum, account) => sum + cents(ledgerIds.has(account.id) ? account.plaidCurrentBalance : account.balance), 0)
  // Available cash is the bank's authoritative spendable snapshot. Its holds
  // must not be subtracted again from a separately refreshed transaction feed.
  const availableIds = new Set(accounts.filter(account => ledgerIds.has(account.id) && Number.isFinite(account.plaidAvailableBalance)).map(account => account.id))
  const anchor = accounts.reduce((sum, account) => sum + cents(availableIds.has(account.id) ? account.plaidAvailableBalance : ledgerIds.has(account.id) ? account.plaidCurrentBalance : account.balance), 0)
  // Generic projection supplies recurrence expansion and past estimates only.
  const projection = buildProjection(accounts, transactions, options.days ?? 365, {}, options.pastDays ?? 365, current / 100, parseISODate(today))
  const scoped = actuals.filter(actual => actual.id && ids.has(accountMap[actual.accountId]) && Number.isFinite(Number(actual.amount)) && parseISODate(actual.date) && actual.date <= today)
  const superseded = new Set(scoped.filter(actual => !actual.pending).map(actual => actual.pendingTransactionId).filter(Boolean))
  const bank = [...new Map(scoped.filter(actual => !actual.pending || !superseded.has(actual.id)).map(actual => [actual.id, actual])).values()]
  const pending = bank.filter(actual => actual.pending && ledgerIds.has(accountMap[actual.accountId]) && !availableIds.has(accountMap[actual.accountId]))
  const pendingDelta = pending.reduce((sum, actual) => sum - cents(actual.amount), 0)
  const occurrences = []
  for (const [date, point] of projection) {
    if (date > toISO(addDays(parseISODate(today), 14))) continue
    for (const plan of point.txns) occurrences.push({ date, plan, key:`${date}:${plan.id}`, matches:[] })
  }
  const used = new Set()
  const assigned = new Map()
  // Transfers require matching each in-scope leg independently.
  const legs = occurrence => occurrence.plan.type === 'transfer'
    ? [{ acct:occurrence.plan.acct, amount:cents(occurrence.plan.amount) }, { acct:occurrence.plan.transferTo, amount:-cents(occurrence.plan.amount) }].filter(leg => ids.has(leg.acct))
    : [{ acct:occurrence.plan.acct, amount:cents(occurrence.plan.amount) * (occurrence.plan.type === 'income' ? -1 : 1) }]
  const candidates = occurrences.flatMap(occurrence => legs(occurrence).map((leg, index) => ({ ...occurrence, leg, key:`${occurrence.key}:${index}` })))
  const matches = (candidate, actual, exactDate) => {
    if (candidate.leg.acct !== accountMap[actual.accountId]) return false
    if (approvedReconciliationMatches(candidate.plan, actual, candidate.date, accountMap)) return true
    if (candidate.plan.reconciliation) return false
    if (exactDate ? candidate.date !== actual.date : Math.abs(dayNumber(candidate.date) - dayNumber(actual.date)) > 7) return false
    if (Math.sign(candidate.leg.amount) !== Math.sign(cents(actual.amount))) return false
    // A unique same-day source identity can reconcile a different posted amount.
    if (!exactDate && candidate.leg.amount !== cents(actual.amount)) return false
    if (candidate.plan.vendorId && actual.vendorId) return candidate.plan.vendorId === actual.vendorId
    if (exactDate && candidate.leg.amount === cents(actual.amount) && genericPayrollMatch(candidate.plan, actual)) return true
    const name = normalizeMerchantName(candidate.plan)
    return Boolean(name && (name === normalizeMerchantName(actual) || (exactDate && candidate.plan.type === 'income' && sameIncomeSource(candidate.plan,actual))))
  }
  for (const exactDate of [true, false]) {
    const edges = candidates.filter(candidate => !assigned.has(candidate.key)).flatMap(candidate => bank.filter(actual => !used.has(actual.id) && matches(candidate, actual, exactDate)).map(actual => ({ candidate, actual })))
    const perPlan = new Map(), perBank = new Map()
    for (const edge of edges) {
      perPlan.set(edge.candidate.key, (perPlan.get(edge.candidate.key) || 0) + 1)
      perBank.set(edge.actual.id, (perBank.get(edge.actual.id) || 0) + 1)
    }
    for (const { candidate, actual } of edges) {
      if (perPlan.get(candidate.key) !== 1 || perBank.get(actual.id) !== 1) continue
      assigned.set(candidate.key, actual)
      used.add(actual.id)
    }
  }
  const reconcile = options.reconcile !== false
  const yesterday = toISO(addDays(parseISODate(today), -1))
  const verifiedClose = options.closingBalances?.[yesterday]
  const reconstructedClose = options.reconstructedBalances?.[yesterday]
  const snapshot = options.balanceHistory?.find(row => row.date === yesterday && accounts.every(account => Number.isFinite(row.balances?.[account.plaidAccountId])))
  const observed = snapshot ? accounts.reduce((sum,account) => sum + cents(snapshot.balances[account.plaidAccountId]),0) : null
  const opening = Number.isFinite(verifiedClose) ? cents(verifiedClose)
    : Number.isFinite(reconstructedClose) ? cents(reconstructedClose)
    : observed !== null ? observed
    : current + bank.filter(row => !row.pending && row.date === today).reduce((sum,row) => sum + cents(row.amount), 0)
  const openingSource = Number.isFinite(verifiedClose) ? 'verified-close'
    : Number.isFinite(reconstructedClose) ? 'reconstructed-close' : 'estimated-opening'
  // Planned mode follows occurrence dates only. A pending/late-posted match
  // must not move yesterday's scheduled income or expense into today: the
  // opening snapshot may already include it. Bank timing belongs exclusively
  // to reconciled mode; changing a plan's date requires an explicit reschedule.
  let balance = reconcile ? anchor + pendingDelta : opening
  for (const [date, point] of projection) {
    if (date < today) {
      const recorded = options.recordedClosingBalances?.[date]
      const reconstructed = options.reconstructedBalances?.[date]
      projection.set(date, {...point, bal:Number.isFinite(recorded) ? recorded : Number.isFinite(reconstructed) ? reconstructed : undefined,
        balanceSource:Number.isFinite(recorded) ? 'user-recorded' : Number.isFinite(reconstructed) ? 'reconstructed' : 'unavailable'})
      continue
    }
    let remaining = 0
    const realization = point.txns.map(plan => {
      const occurrence = { date, plan, key:`${date}:${plan.id}` }
      let delta = 0
      const statuses = legs(occurrence).map((leg, index) => {
        const actual = assigned.get(`${occurrence.key}:${index}`)
        // Pending rows are already applied above if a posted-ledger anchor exists.
        // Otherwise available/stored balance may already include the hold.
        if (!reconcile || !actual) delta -= leg.amount
        return actual ? { status:actual.pending ? 'pending' : 'posted', actualId:actual.id, actualAmount:Number(actual.amount), plannedAmount:leg.amount / 100 } : { status:'expected' }
      })
      remaining += delta
      return { id:plan.id, name:plan.name, delta:delta / 100, statuses }
    })
    balance += remaining
    projection.set(date, { ...point, bal:balance / 100, remainingDelta:remaining / 100, realization,
      ...(date === today ? { mode:reconcile ? 'reconciled' : 'planned', anchorEstimated:Boolean(options.anchorEstimated), openingBalance:opening / 100, openingSource, openingDate:yesterday, overdueDelta:0, overdue:[], currentBalance:current / 100, anchorBalance:anchor / 100,
        anchorKind:availableIds.size === accounts.length ? 'available' : availableIds.size ? 'mixed' : 'current',
        pendingActivity:bank.filter(actual => actual.pending).map(actual => ({ id:actual.id, date:actual.date, name:actual.name || actual.merchant_name || 'Pending transaction', accountName:accounts.find(account => account.id === accountMap[actual.accountId])?.name || 'Cash account', delta:-cents(actual.amount) / 100, applied:reconcile && ledgerIds.has(accountMap[actual.accountId]) && !availableIds.has(accountMap[actual.accountId]) })),
        pendingDelta:reconcile ? pendingDelta / 100 : 0,
        unresolvedPastCount:candidates.filter(candidate => candidate.date < today && !assigned.has(candidate.key)).length,
        ledgerComplete:ledgerIds.size === accounts.length,
        pendingExcluded:bank.filter(actual => actual.pending && !ledgerIds.has(accountMap[actual.accountId])).length,
        unmatchedCount:realization.filter(row => row.statuses.some(status => status.status === 'expected')).length } : {}) })
  }
  const result = applyBudgetAllowances(projection,{accounts,scheduled:transactions,actuals,budget:options.budget,today})
  const adjustments = new Map()
  for (const account of accounts) {
    const overrides = options.projectedClosingBalances?.[account.id] || {}
    if (!Object.entries(overrides).some(([date,row]) => date > today && row?.source === 'user-projected' && Number.isFinite(row.amount))) continue
    const single = buildOutstandingCashForecast([account], transactions.filter(tx=>tx.acct===account.id || tx.transferTo===account.id), actuals, {...options,projectedClosingBalances:null})
    let offset = 0
    for (const [date, point] of single) {
      if (date <= today) continue
      const row = overrides[date]
      if (row?.source === 'user-projected' && Number.isFinite(row.amount)) offset = cents(row.amount) - cents(point.bal)
      const previous = adjustments.get(date) || {offset:0,accounts:[]}
      adjustments.set(date,{offset:previous.offset+offset,accounts:[...previous.accounts,...(row?.source==='user-projected'?[account.id]:[])]})
    }
  }
  for (const [date, adjustment] of adjustments) {
    const point=result.get(date)
    if (point) result.set(date,{...point,bal:(cents(point.bal)+adjustment.offset)/100,projectionAdjustment:adjustment.offset/100,isOverridden:adjustment.accounts.length>0,overriddenAccounts:adjustment.accounts})
  }
  return result
}

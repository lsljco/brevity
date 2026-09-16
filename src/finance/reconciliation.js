import { txOccursOnDate } from './projection.js'
import { actualTransactionKind, categoryGroup, isRecognizedIncomeTransaction, isTransferTransaction, transactionDirection } from './reportingData.js'
import { normalizeMerchantName } from './financialTruth.js'
import { getHouseholdDateKey } from './financeTime.js'

const amountOf = transaction => Math.abs(Number(transaction?.amount) || 0)
const directionOfScheduled = transaction => transaction?.type === 'income' ? 'income' : transaction?.type === 'expense' ? 'expense' : 'transfer'
const dayDistance = (left, right) => Math.round(Math.abs(new Date(`${left}T12:00:00`) - new Date(`${right}T12:00:00`)) / 86400000)
const actualKey = transaction => transaction?.id || `${normalizeMerchantName(transaction)}:${transaction?.date || ''}:${amountOf(transaction)}`

function directionalTotals(rows, transactionOf, directionOf) {
  return rows.reduce((totals, row) => {
    const transaction = transactionOf(row)
    if (!transaction) return totals
    const direction = directionOf(transaction)
    if (!['income', 'expense', 'other-inflow'].includes(direction)) return totals
    const amount = amountOf(transaction)
    if (direction === 'other-inflow') totals.otherInflows = (totals.otherInflows || 0) + amount
    else totals[direction] += amount
    totals.total += amount
    totals.count += 1
    return totals
  }, { income:0, expense:0, total:0, count:0 })
}

function matchedDifferenceTotals(rows) {
  return rows.reduce((totals, row) => {
    if (!row.expected || !Number.isFinite(Number(row.amountVariance))) return totals
    const direction = directionOfScheduled(row.expected)
    if (direction !== 'income' && direction !== 'expense') return totals
    const difference = Number(row.amountVariance)
    totals[direction] += difference
    totals.netCash += direction === 'income' ? difference : -difference
    totals.count += 1
    return totals
  }, { income:0, expense:0, netCash:0, count:0 })
}

export function reconciliationDrilldownTarget(row) {
  if (row?.actual?.id && row.actual.date) {
    return {
      type:'actual',
      filter:{ ids:[row.actual.id], dateFrom:row.actual.date, dateTo:row.actual.date },
    }
  }
  if (row?.candidates?.length) {
    const candidates = row.candidates.filter(candidate => candidate?.id && candidate?.date)
    if (!candidates.length) return null
    const dates = candidates.map(candidate => candidate.date).sort()
    return {
      type:'actual',
      filter:{ ids:candidates.map(candidate => candidate.id), dateFrom:dates[0], dateTo:dates.at(-1) },
    }
  }
  if (row?.expected?.id && row.expected.occurrenceDate) {
    return {
      type:'scheduled',
      filter:{
        ids:[row.expected.id],
        range:{ preset:'custom', from:row.expected.occurrenceDate, to:row.expected.occurrenceDate },
      },
    }
  }
  return null
}

function merchantScore(expected, actual) {
  const left = normalizeMerchantName(expected), right = normalizeMerchantName(actual)
  if (!left || !right) return 0
  if (left === right) return 55
  if (Math.min(left.length, right.length) >= 5 && (left.includes(right) || right.includes(left))) return 48
  const a = new Set(left.split(' ')), b = new Set(right.split(' '))
  const overlap = [...a].filter(token => b.has(token)).length
  return overlap ? Math.min(42, 18 + overlap * 12) : 0
}

function matchScore(expected, actual, expectedDate) {
  const expectedDirection = directionOfScheduled(expected)
  if (expectedDirection === 'income' && !isRecognizedIncomeTransaction(actual, { allowPending:true })) return -1
  if (expectedDirection === 'expense' && transactionDirection(actual) !== 'expense') return -1
  const planned = amountOf(expected), posted = amountOf(actual)
  const ratio = planned ? Math.abs(planned - posted) / planned : 1
  const amountScore = ratio <= 0.02 ? 25 : ratio <= 0.1 ? 18 : ratio <= 0.25 ? 10 : 0
  const expectedCategory = categoryGroup(expected.cat || expected.category)
  const actualCategory = categoryGroup(actual.category || actual.cat)
  const categoryScore = expectedCategory !== 'Other' && expectedCategory === actualCategory ? 12 : 0
  const distance = dayDistance(expectedDate, actual.date)
  const timingScore = distance === 0 ? 10 : distance <= 2 ? 7 : distance <= 4 ? 3 : 0
  return merchantScore(expected, actual) + amountScore + categoryScore + timingScore
}

function occurrence(transaction, date) {
  return {
    ...transaction,
    occurrenceId: `${transaction.id || normalizeMerchantName(transaction)}:${date}`,
    occurrenceDate: date,
    expectedAmount: amountOf(transaction),
  }
}

function matchedRow(candidate, date) {
  const amountVariance = amountOf(candidate.actual) - candidate.plan.expectedAmount
  const timingVariance = dayDistance(date, candidate.actual.date)
  const materialAmount = Math.abs(amountVariance) > Math.max(2, candidate.plan.expectedAmount * 0.02)
  const state = materialAmount && timingVariance ? 'amount-and-timing-variance' : materialAmount ? 'amount-variance' : timingVariance ? 'timing-variance' : candidate.actual.pending ? 'pending-match' : 'matched'
  return { state, expected:candidate.plan, actual:candidate.actual, amountVariance, timingVariance, realizationStatus:candidate.actual.pending ? 'pending' : 'posted', confidence:candidate.score >= 82 ? 'high' : 'medium' }
}

export function reconcileFinanceDay({ scheduled = [], actuals = [], date = getHouseholdDateKey(), matchWindowDays = 4 } = {}) {
  const target = new Date(`${date}T12:00:00`)
  const expected = scheduled
    .filter(transaction => !isTransferTransaction(transaction) && directionOfScheduled(transaction) !== 'transfer' && txOccursOnDate(transaction, target))
    .map(transaction => occurrence(transaction, date))
  const eligibleActuals = actuals.filter(transaction => {
    if (!transaction?.date || isTransferTransaction(transaction)) return false
    return dayDistance(date, transaction.date) <= matchWindowDays
  })

  const candidates = []
  expected.forEach(plan => eligibleActuals.forEach(actual => {
    const score = matchScore(plan, actual, date)
    if (score >= 48) candidates.push({ plan, actual, score })
  }))
  candidates.sort((a, b) => b.score - a.score)

  const usedPlans = new Set(), usedActuals = new Set(), rows = []
  const candidatesByPlan = new Map()
  const candidatesByActual = new Map()
  candidates.forEach(candidate => {
    const planKey = candidate.plan.occurrenceId
    const bankKey = actualKey(candidate.actual)
    if (!candidatesByPlan.has(planKey)) candidatesByPlan.set(planKey, [])
    if (!candidatesByActual.has(bankKey)) candidatesByActual.set(bankKey, [])
    candidatesByPlan.get(planKey).push(candidate)
    candidatesByActual.get(bankKey).push(candidate)
  })

  // Secure strong, exact, mutually dominant matches before resolving ambiguity.
  // A generic scheduled item can be plausibly tied to several bank rows. Without
  // this pass, its ambiguity group could reserve a bank row that is the clear
  // exact match for a more specific scheduled item and make that item look
  // missing. Re-evaluate the remaining candidate lists after every match so a
  // resolved pair cannot continue influencing another pair's confidence.
  const availableCandidates = list => list.filter(candidate => (
    !usedPlans.has(candidate.plan.occurrenceId) && !usedActuals.has(actualKey(candidate.actual))
  ))
  const isClearlyFirst = (candidate, list) => {
    const available = availableCandidates(list)
    return available[0] === candidate && (available.length === 1 || candidate.score - available[1].score > 5)
  }
  for (const candidate of candidates) {
    const planKey = candidate.plan.occurrenceId
    const bankKey = actualKey(candidate.actual)
    if (usedPlans.has(planKey) || usedActuals.has(bankKey)) continue
    const exactMerchant = normalizeMerchantName(candidate.plan) === normalizeMerchantName(candidate.actual)
    if (!exactMerchant || candidate.score < 82) continue
    if (!isClearlyFirst(candidate, candidatesByPlan.get(planKey) || [])) continue
    if (!isClearlyFirst(candidate, candidatesByActual.get(bankKey) || [])) continue
    usedPlans.add(planKey)
    usedActuals.add(bankKey)
    rows.push(matchedRow(candidate, date))
  }

  // Resolve near-ties as connected possible-match sets before greedy matching.
  // This covers both one plan with multiple plausible bank rows and one bank
  // row that could satisfy multiple plans, without consuming the same record
  // twice or arbitrarily selecting whichever candidate sorted first.
  const unresolvedCandidatesByPlan = new Map()
  const unresolvedCandidatesByActual = new Map()
  candidates.forEach(candidate => {
    const planKey = candidate.plan.occurrenceId
    const bankKey = actualKey(candidate.actual)
    if (usedPlans.has(planKey) || usedActuals.has(bankKey)) return
    if (!unresolvedCandidatesByPlan.has(planKey)) unresolvedCandidatesByPlan.set(planKey, [])
    if (!unresolvedCandidatesByActual.has(bankKey)) unresolvedCandidatesByActual.set(bankKey, [])
    unresolvedCandidatesByPlan.get(planKey).push(candidate)
    unresolvedCandidatesByActual.get(bankKey).push(candidate)
  })
  const ambiguousCandidates = new Set()
  const addNearTies = list => {
    if (list.length < 2 || list[0].score - list[1].score > 5) return
    list.filter(candidate => list[0].score - candidate.score <= 5).forEach(candidate => ambiguousCandidates.add(candidate))
  }
  unresolvedCandidatesByPlan.forEach(addNearTies)
  unresolvedCandidatesByActual.forEach(addNearTies)

  const parent = new Map()
  const find = key => {
    if (!parent.has(key)) parent.set(key, key)
    if (parent.get(key) !== key) parent.set(key, find(parent.get(key)))
    return parent.get(key)
  }
  const union = (left, right) => {
    const leftRoot = find(left), rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }
  ambiguousCandidates.forEach(candidate => union(`plan:${candidate.plan.occurrenceId}`, `actual:${actualKey(candidate.actual)}`))
  const ambiguousGroups = new Map()
  ambiguousCandidates.forEach(candidate => {
    const root = find(`plan:${candidate.plan.occurrenceId}`)
    if (!ambiguousGroups.has(root)) ambiguousGroups.set(root, { plans:new Map(), actuals:new Map() })
    const group = ambiguousGroups.get(root)
    group.plans.set(candidate.plan.occurrenceId, candidate.plan)
    group.actuals.set(actualKey(candidate.actual), candidate.actual)
  })
  ambiguousGroups.forEach(group => {
    const plans = [...group.plans.values()]
    const bankActivity = [...group.actuals.values()]
    plans.forEach(plan => usedPlans.add(plan.occurrenceId))
    bankActivity.forEach(actual => usedActuals.add(actualKey(actual)))
    rows.push({
      state:'ambiguous',
      ...(plans.length === 1 ? { expected:plans[0] } : { expectedCandidates:plans }),
      ...(bankActivity.length === 1 ? { actual:bankActivity[0] } : { candidates:bankActivity }),
      confidence:'low',
    })
  })

  for (const candidate of candidates) {
    const bankKey = actualKey(candidate.actual)
    if (usedPlans.has(candidate.plan.occurrenceId) || usedActuals.has(bankKey)) continue
    usedPlans.add(candidate.plan.occurrenceId)
    usedActuals.add(bankKey)
    rows.push(matchedRow(candidate, date))
  }

  expected.filter(plan => !usedPlans.has(plan.occurrenceId)).forEach(plan => rows.push({ state:'missing-actual', expected:plan, confidence:'medium' }))
  eligibleActuals.filter(actual => actual.date === date && !usedActuals.has(actualKey(actual))).forEach(actual => rows.push({ state:'unplanned-actual', actual, actualKind:actualTransactionKind(actual), confidence:'high' }))

  const counts = rows.reduce((summary, row) => ({ ...summary, [row.state]:(summary[row.state] || 0) + 1 }), {})
  // Paired income and expense differences affect cash in opposite directions,
  // so preserve each direction and expose their net cash effect instead of
  // combining unlike differences into one ambiguous amount.
  const matchedDifference = matchedDifferenceTotals(rows)
  const expectedNotPosted = directionalTotals(
    rows.filter(row => row.state === 'missing-actual'),
    row => row.expected,
    directionOfScheduled,
  )
  const unplannedPosted = directionalTotals(
    rows.filter(row => row.state === 'unplanned-actual'),
    row => row.actual,
    actualTransactionKind,
  )
  const unresolvedExposureTotal = expectedNotPosted.total + unplannedPosted.total
  const needsReview = rows.filter(row => row.state !== 'matched')
  return {
    date,
    rows,
    counts,
    matched:counts.matched || 0,
    needsReview,
    matchedDifference,
    expectedNotPosted,
    unplannedPosted,
    unresolvedExposureTotal,
    allClear:needsReview.length === 0,
  }
}

export function reconciliationStateLabel(state) {
  return ({
    matched:'Matched',
    'pending-match':'Pending match',
    'amount-variance':'Amount variance',
    'timing-variance':'Timing variance',
    'amount-and-timing-variance':'Amount + timing variance',
    'missing-actual':'Expected, not found',
    'unplanned-actual':'Unplanned bank activity',
    ambiguous:'Possible matches',
  })[state] || state
}

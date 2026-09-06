import { toISO, txOccursOnDate } from './projection.js'
import { categoryGroup, isTransferTransaction, transactionDirection } from './reportingData.js'
import { normalizeMerchantName } from './financialTruth.js'

const amountOf = transaction => Math.abs(Number(transaction?.amount) || 0)
const directionOfScheduled = transaction => transaction?.type === 'income' ? 'income' : transaction?.type === 'expense' ? 'expense' : 'transfer'
const dayDistance = (left, right) => Math.round(Math.abs(new Date(`${left}T12:00:00`) - new Date(`${right}T12:00:00`)) / 86400000)

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
  if (directionOfScheduled(expected) !== transactionDirection(actual)) return -1
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

export function reconcileFinanceDay({ scheduled = [], actuals = [], date = toISO(new Date()), matchWindowDays = 4 } = {}) {
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
  for (const candidate of candidates) {
    if (usedPlans.has(candidate.plan.occurrenceId) || usedActuals.has(candidate.actual.id)) continue
    const alternatives = candidates.filter(other => other.plan.occurrenceId === candidate.plan.occurrenceId && !usedActuals.has(other.actual.id))
    if (alternatives.length > 1 && candidate.score - alternatives[1].score <= 5) {
      usedPlans.add(candidate.plan.occurrenceId)
      alternatives.slice(0, 3).forEach(item => usedActuals.add(item.actual.id))
      rows.push({ state:'ambiguous', expected:candidate.plan, candidates:alternatives.slice(0, 3).map(item => item.actual), confidence:'low' })
      continue
    }
    usedPlans.add(candidate.plan.occurrenceId)
    usedActuals.add(candidate.actual.id)
    const amountVariance = amountOf(candidate.actual) - candidate.plan.expectedAmount
    const timingVariance = dayDistance(date, candidate.actual.date)
    const materialAmount = Math.abs(amountVariance) > Math.max(2, candidate.plan.expectedAmount * 0.02)
    const state = materialAmount && timingVariance ? 'amount-and-timing-variance' : materialAmount ? 'amount-variance' : timingVariance ? 'timing-variance' : 'matched'
    rows.push({ state, expected:candidate.plan, actual:candidate.actual, amountVariance, timingVariance, confidence:candidate.score >= 82 ? 'high' : 'medium' })
  }

  expected.filter(plan => !usedPlans.has(plan.occurrenceId)).forEach(plan => rows.push({ state:'missing-actual', expected:plan, confidence:'medium' }))
  eligibleActuals.filter(actual => actual.date === date && !usedActuals.has(actual.id)).forEach(actual => rows.push({ state:'unplanned-actual', actual, confidence:'high' }))

  const counts = rows.reduce((summary, row) => ({ ...summary, [row.state]:(summary[row.state] || 0) + 1 }), {})
  const varianceTotal = rows.reduce((sum, row) => sum + Number(row.amountVariance || 0), 0)
  const needsReview = rows.filter(row => row.state !== 'matched')
  return { date, rows, counts, matched:counts.matched || 0, needsReview, varianceTotal, allClear:needsReview.length === 0 }
}

export function reconciliationStateLabel(state) {
  return ({
    matched:'Matched',
    'amount-variance':'Amount variance',
    'timing-variance':'Timing variance',
    'amount-and-timing-variance':'Amount + timing variance',
    'missing-actual':'Expected, not posted',
    'unplanned-actual':'Unplanned actual',
    ambiguous:'Possible matches',
  })[state] || state
}

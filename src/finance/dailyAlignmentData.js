import { addDays, parseISODate, toISO, txOccursOnDate } from './projection.js'
import { calculateMonthlyCashFlow, calculateTransactionAmountForMonth } from './monthlyCashFlow.js'

export const ALIGNMENT_PEOPLE = ['Larry', 'Lorenzo', 'Terica', 'Nyla']
export const DEFAULT_MONTHLY_SURPLUS_VISION = 50000

export function emptyDailyAlignmentRecord() {
  return {
    actions: ALIGNMENT_PEOPLE.map(person => ({ person, yesterday: '', action: '', due: '', complete: false })),
    decisions: Array.from({ length: 3 }, () => ({ issue: '', decision: '', owner: '', due: '', complete: false })),
    commitments: ALIGNMENT_PEOPLE.map(person => ({ person, commitment: '', due: '', complete: false })),
  }
}

export function normalizeDailyAlignmentRecord(value = {}) {
  const empty = emptyDailyAlignmentRecord()
  const byPerson = rows => new Map((Array.isArray(rows) ? rows : []).map(row => [row.person, row]))
  const actionRows = byPerson(value.actions)
  const commitmentRows = byPerson(value.commitments)
  return {
    actions: empty.actions.map(row => ({ ...row, ...(actionRows.get(row.person) || {}) })),
    decisions: empty.decisions.map((row, index) => ({ ...row, ...(value.decisions?.[index] || {}) })),
    commitments: empty.commitments.map(row => ({ ...row, ...(commitmentRows.get(row.person) || {}) })),
  }
}

function directionOfActual(transaction) {
  return Number(transaction?.amount) < 0 ? 'income' : 'expense'
}

function money(value) {
  return Math.abs(Number(value) || 0)
}

function categoryOf(transaction) {
  return String(transaction?.category || transaction?.cat || '').trim().toLowerCase().replaceAll('_', ' ')
}

function isDiscretionary(transaction) {
  const category = categoryOf(transaction)
  return category === 'discretionary' || /shopping|entertainment|personal care|travel|merchandise/.test(category)
}

function pairScheduledWithActuals(scheduled, actuals) {
  const usedActualIndexes = new Set()
  const pairs = scheduled.map(transaction => {
    const direction = transaction.type === 'income' ? 'income' : 'expense'
    const amount = money(transaction.amount)
    const actualIndex = actuals.findIndex((actual, index) => {
      if (usedActualIndexes.has(index) || directionOfActual(actual) !== direction) return false
      const tolerance = Math.max(1, amount * 0.015)
      return Math.abs(money(actual.amount) - amount) <= tolerance
    })
    if (actualIndex >= 0) usedActualIndexes.add(actualIndex)
    return { transaction, actual: actualIndex >= 0 ? actuals[actualIndex] : null }
  })
  return { pairs, unmatchedActuals: actuals.filter((_, index) => !usedActualIndexes.has(index)) }
}

function scheduledForDate(transactions, date) {
  return transactions.filter(transaction => transaction.type !== 'transfer' && txOccursOnDate(transaction, date))
}

function actualsForDate(actuals, date) {
  const dateKey = toISO(date)
  return actuals.filter(transaction => transaction.date === dateKey)
}

function outstandingForDate(transactions, actuals, date) {
  const scheduled = scheduledForDate(transactions, date)
  const actual = actualsForDate(actuals, date)
  return pairScheduledWithActuals(scheduled, actual).pairs.filter(pair => !pair.actual).map(pair => pair.transaction)
}

function plannedDiscretionaryBudget(transactions, budget, selectedDate) {
  const monthIndex = selectedDate.getMonth()
  return transactions
    .filter(transaction => transaction.type === 'expense' && transaction.freq !== 'once' && isDiscretionary(transaction))
    .reduce((total, transaction) => {
      const plannedValue = budget?.[transaction.name]?.[monthIndex]
      const hasPlan = plannedValue !== undefined && plannedValue !== null && plannedValue !== ''
      return total + (hasPlan
        ? Math.max(Number(plannedValue) || 0, 0)
        : calculateTransactionAmountForMonth(transaction, selectedDate, { recurringOnly: true }))
    }, 0)
}

export function buildDailyAlignmentSnapshot({
  date,
  accounts = [],
  scheduled = [],
  monthlyScheduled = scheduled,
  actuals = [],
  budget = {},
  projectedBalance,
} = {}) {
  const selectedDate = parseISODate(date) || new Date()
  selectedDate.setHours(0, 0, 0, 0)
  const dateKey = toISO(selectedDate)
  const tomorrow = addDays(selectedDate, 1)
  const todayScheduled = scheduledForDate(scheduled, selectedDate)
  const todayActuals = actualsForDate(actuals, selectedDate)
  const { pairs, unmatchedActuals } = pairScheduledWithActuals(todayScheduled, todayActuals)
  const outstandingToday = pairs.filter(pair => !pair.actual).map(pair => pair.transaction)
  const outstandingTomorrow = outstandingForDate(scheduled, actuals, tomorrow)
  const outstandingWindow = [...outstandingToday, ...outstandingTomorrow]

  const expectedInflows = outstandingWindow
    .filter(transaction => transaction.type === 'income')
    .reduce((total, transaction) => total + money(transaction.amount), 0)
  const dueTodayTomorrow = outstandingWindow
    .filter(transaction => transaction.type === 'expense')
    .reduce((total, transaction) => total + money(transaction.amount), 0)

  const monthlyTotals = calculateMonthlyCashFlow(monthlyScheduled, selectedDate)
  const monthlyIncome = monthlyTotals.income
  const monthlyExpenses = monthlyTotals.recurringExpenses

  const monthPrefix = dateKey.slice(0, 7)
  const actualMonthToDate = actuals.filter(transaction => transaction.date?.startsWith(monthPrefix) && transaction.date <= dateKey)
  const discretionarySpent = actualMonthToDate
    .filter(transaction => directionOfActual(transaction) === 'expense' && isDiscretionary(transaction))
    .reduce((sum, transaction) => sum + money(transaction.amount), 0)
  const discretionaryBudget = plannedDiscretionaryBudget(scheduled, budget, selectedDate)
  const discretionaryRemaining = Math.max(discretionaryBudget - discretionarySpent, 0)
  const daysRemaining = Math.max(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate() - selectedDate.getDate() + 1, 1)
  const approvedDiscretionary = discretionaryRemaining / daysRemaining

  const movements = [
    ...todayActuals.map(transaction => ({
      id: transaction.id,
      transaction,
      name: transaction.name || transaction.merchant_name || 'Transaction',
      amount: money(transaction.amount),
      direction: directionOfActual(transaction),
      status: transaction.pending ? 'Pending' : 'Posted',
      source: 'actual',
      category: transaction.category || transaction.cat || 'Uncategorized',
    })),
    ...outstandingToday.map(transaction => ({
      id: `expected-${transaction.id}`,
      transaction,
      name: transaction.name,
      amount: money(transaction.amount),
      direction: transaction.type === 'income' ? 'income' : 'expense',
      status: 'Expected',
      source: 'scheduled',
      category: transaction.cat || 'Uncategorized',
    })),
  ].sort((a, b) => b.amount - a.amount)

  const pendingAmount = todayActuals.filter(transaction => transaction.pending).reduce((sum, transaction) => sum + money(transaction.amount), 0)
  const availableOperatingCash = Number.isFinite(Number(projectedBalance))
    ? Number(projectedBalance)
    : accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0)

  return {
    date: dateKey,
    availableOperatingCash,
    expectedInflows,
    dueTodayTomorrow,
    approvedDiscretionary,
    discretionaryBudget,
    discretionarySpent,
    monthlyIncome,
    monthlyExpenses,
    monthlyCashFlow: monthlyTotals.cashFlow,
    // Retain the legacy field so previously shipped consumers remain compatible.
    monthlySurplus: monthlyTotals.cashFlow,
    movements,
    risks: {
      balance: availableOperatingCash < dueTodayTomorrow
        ? `${money(dueTodayTomorrow - availableOperatingCash).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} short of near-term obligations`
        : `${money(availableOperatingCash - dueTodayTomorrow).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} after near-term obligations`,
      unexpected: unmatchedActuals.length
        ? `${unmatchedActuals.length} unmatched transaction${unmatchedActuals.length === 1 ? '' : 's'} · ${unmatchedActuals.reduce((sum, transaction) => sum + money(transaction.amount), 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
        : 'No unmatched transactions',
      timing: outstandingToday.length
        ? `${outstandingToday.length} expected item${outstandingToday.length === 1 ? '' : 's'} not posted`
        : 'No posting issues detected',
      pendingAmount,
    },
  }
}

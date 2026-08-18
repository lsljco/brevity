import { addDays, parseISODate, toISO, txOccursOnDate } from './projection.js'

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

function monthlyEquivalent(transaction) {
  const multiplier = { daily: 30, weekly: 4.33, biweekly: 2.167, semimonthly: 2, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0 }
  return money(transaction.amount) * (multiplier[transaction.freq] ?? 1)
}

function datesInMonth(date) {
  const dates = []
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1)
  while (cursor.getMonth() === date.getMonth()) {
    dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
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

function plannedDiscretionaryBudget(transactions, budget, monthIndex) {
  return transactions
    .filter(transaction => transaction.type === 'expense' && transaction.freq !== 'once' && isDiscretionary(transaction))
    .reduce((total, transaction) => {
      const planned = Number(budget?.[transaction.name]?.[monthIndex])
      return total + (planned > 0 ? planned : monthlyEquivalent(transaction))
    }, 0)
}

export function buildDailyAlignmentSnapshot({
  date,
  accounts = [],
  scheduled = [],
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

  const monthDates = datesInMonth(selectedDate)
  const scheduledMonth = monthDates.flatMap(day => scheduledForDate(scheduled, day))
  const monthlyIncome = scheduledMonth.filter(transaction => transaction.type === 'income').reduce((sum, transaction) => sum + money(transaction.amount), 0)
  const monthlyExpenses = scheduledMonth.filter(transaction => transaction.type === 'expense').reduce((sum, transaction) => sum + money(transaction.amount), 0)

  const monthPrefix = dateKey.slice(0, 7)
  const actualMonthToDate = actuals.filter(transaction => transaction.date?.startsWith(monthPrefix) && transaction.date <= dateKey)
  const discretionarySpent = actualMonthToDate
    .filter(transaction => directionOfActual(transaction) === 'expense' && isDiscretionary(transaction))
    .reduce((sum, transaction) => sum + money(transaction.amount), 0)
  const discretionaryBudget = plannedDiscretionaryBudget(scheduled, budget, selectedDate.getMonth())
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
    monthlySurplus: monthlyIncome - monthlyExpenses,
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

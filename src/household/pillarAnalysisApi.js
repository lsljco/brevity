import { canonicalizeCalendarReadEvent } from '../family/calendarNames.js'
import { calendarSnapshotHealth } from '../family/calendarSnapshot.js'
import { buildCanonicalFinanceModel } from '../finance/financeDomain.js'
import { migrateFinanceData } from '../finance/financeData.js'
import { getHouseholdDateKey } from '../finance/financeTime.js'
import { transactionOccurrencesForRange } from '../finance/monthlyCashFlow.js'
import { parseISODate, toISO } from '../finance/projection.js'
import { reconcileFinanceDay } from '../finance/reconciliation.js'
import { isTransferTransaction, transactionDirection } from '../finance/reportingData.js'
import { applyTransactionRules } from '../finance/transactionRules.js'
import { buildHouseholdMaintenanceWeek, householdOccurrence, normalizeHouseholdMaintenanceState, occurrenceStatus, summarizeHouseholdMaintenance } from './householdMaintenanceData.js'
import { inventoryIntelligence } from './householdInventoryData.js'
import { normalizeHouseholdScheduleState, routineOccurrencesForDate } from './householdScheduleData.js'
import { PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisContextSignature, pillarAnalysisStorageKey } from './pillarAnalysisCache.js'

const ENDPOINT = '/.netlify/functions/pillar-analysis'
const REQUEST_TIMEOUT_MS = 45000
const TRANSACTION_FRESHNESS_KEY = 'brevity_plaid_transaction_freshness_v1'
export const PILLAR_ANALYSIS_EVENT = 'brevity-pillar-analysis-refreshed'
const latestRequests = new Map()

function safeJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

export { clearPillarAnalyses, PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisContextSignature, pillarAnalysisStorageKey } from './pillarAnalysisCache.js'
const memberSegment = member => String(member || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'unknown'

export function readPillarAnalysis(date, pillar, member, storage = globalThis.localStorage, expectedContextSignature = '') {
  if (!storage || !date || !pillar || !member) return null
  const result = safeJson(storage.getItem(pillarAnalysisStorageKey(date, pillar, member)) || 'null', null)
  if (result?.schemaVersion !== PILLAR_ANALYSIS_SCHEMA_VERSION) return null
  if (memberSegment(result.member) !== memberSegment(member)) return null
  if (expectedContextSignature && result.contextSignature !== expectedContextSignature) return null
  if (result?.quality?.status === 'evidence-fallback') return null
  return { ...result, cached:true }
}

const valueArray = value => Array.isArray(value) ? value : []
const valueObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const compactObject = (value, fields) => Object.fromEntries(fields.filter(field => value?.[field] !== undefined).map(field => [field, value[field]]))
const canonicalRecords = (records, limit = 250) => valueArray(records)
  .map(record => record && typeof record === 'object' ? record : null)
  .filter(Boolean)
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  .slice(0, limit)
const recentRecords = (records, limit = 250) => valueArray(records)
  .map(record => record && typeof record === 'object' ? record : null)
  .filter(Boolean)
  .sort((left, right) => String(right.date || right.authorized_date || '').localeCompare(String(left.date || left.authorized_date || ''))
    || JSON.stringify(left).localeCompare(JSON.stringify(right)))
  .slice(0, limit)

const compactTransaction = transaction => compactObject(transaction, [
  'id', 'transaction_id', 'date', 'authorized_date', 'amount', 'name', 'merchant_name',
  'originalStatement', 'original_description', 'category', 'cat', 'type', 'pending',
  'accountId', 'account_id', 'acct', 'accountName', 'institution', 'tags', 'splits', 'goal',
  'freq', 'frequency', 'start', 'end', 'dayOfWeek', 'dayOfMonth', 'skipDates', 'skips',
  'transferTo',
])
const compactAccount = account => compactObject(account, ['id', 'name', 'type', 'balance', 'plaidAccountId', 'institution'])
const compactRule = rule => compactObject(rule, ['id', 'conditions', 'actions', 'splits', 'applyToExisting', 'createdDate'])
const compactCalendarEvent = event => compactObject(event, [
  'id', 'sourceId', 'source', 'title', 'date', 'start', 'time', 'endTime', 'allDay',
  'owner', 'members', 'participants', 'status', 'pillar', 'notes', 'calendarName', 'recurrence',
])
const compactProject = project => compactObject(project, [
  'id', 'title', 'room', 'status', 'priority', 'owner', 'responsible', 'accountable',
  'consulted', 'informed', 'raci', 'startDate', 'due', 'targetDate', 'dueDate', 'estcost', 'actcost', 'notes',
])
const compactInventoryItem = item => compactObject(item, [
  'id', 'name', 'category', 'location', 'quantity', 'unit', 'parLevel', 'unitCost',
  'expiresOn', 'notes', 'updatedBy',
])
const compactWaste = entry => compactObject(entry, [
  'id', 'itemId', 'name', 'category', 'quantity', 'unit', 'estimatedValue', 'reason',
  'recordedAt', 'recordedBy',
])
const compactScheduleItem = item => compactObject(item, [
  'id', 'title', 'date', 'days', 'startTime', 'endTime', 'owner', 'participants',
  'attendance', 'pillar', 'notes', 'active', 'enabled', 'cancelled', 'status', 'frequency',
])
const compactOccurrence = occurrence => compactObject(occurrence, [
  'complete', 'completedAt', 'completedBy', 'coveredBy', 'exception', 'submittedAt', 'submittedBy', 'approvedAt',
  'approvedBy', 'returnedAt', 'returnedBy', 'returnReason',
])

const RECONCILIATION_STATES = [
  'matched', 'pending-match', 'amount-variance', 'timing-variance',
  'amount-and-timing-variance', 'missing-actual', 'unplanned-actual', 'ambiguous',
]
const amountOf = value => Math.abs(Number(value) || 0)
const transactionName = transaction => transaction?.name || transaction?.label || transaction?.title || transaction?.merchant_name || transaction?.merchantName || transaction?.description || 'Transaction'
const isCancelledRecord = record => record?.cancelled === true || record?.canceled === true || /^(?:cancelled|canceled)$/i.test(String(record?.status || '').trim())
const normalizedAnalysisDate = value => {
  if (typeof value === 'string' && parseISODate(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return getHouseholdDateKey(value)
  return getHouseholdDateKey()
}
const dateKeyFromTimestamp = value => {
  if (typeof value === 'string' && parseISODate(value)) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : getHouseholdDateKey(parsed)
}
const monthRangeForDate = dateKey => {
  const date = parseISODate(dateKey)
  if (!date) return null
  return {
    from:toISO(new Date(date.getFullYear(), date.getMonth(), 1)),
    to:toISO(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  }
}
const stableLargest = (rows, amount = row => amountOf(row?.amount), label = row => transactionName(row)) => [...rows].sort((left, right) => (
  amount(right) - amount(left)
  || String(label(left)).localeCompare(String(label(right)))
  || String(left?.id || '').localeCompare(String(right?.id || ''))
))[0]

function scheduledMonthLines(scheduled, dateKey) {
  const range = monthRangeForDate(dateKey)
  if (!range) return []
  return scheduled.map((transaction, sourceIndex) => {
    if (!['income', 'expense'].includes(transaction?.type)) return null
    const occurrences = transactionOccurrencesForRange(transaction, range)
    if (!occurrences.length) return null
    const monthlyAmount = occurrences.reduce((total, occurrence) => total + amountOf(occurrence.amount), 0)
    if (!monthlyAmount) return null
    return {
      transaction,
      sourceIndex,
      occurrences,
      monthlyAmount,
    }
  }).filter(Boolean)
}

function compactScheduledExpenseLine(line) {
  if (!line) return null
  const transaction = line.transaction
  return compactObject({
    id:transaction.id,
    name:transactionName(transaction),
    monthlyAmount:line.monthlyAmount,
    perOccurrenceAmount:amountOf(transaction.amount),
    occurrenceCount:line.occurrences.length,
    firstOccurrenceDate:line.occurrences[0]?.date,
    category:transaction.category || transaction.cat,
    accountId:transaction.accountId || transaction.account_id || transaction.acct,
  }, ['id', 'name', 'monthlyAmount', 'perOccurrenceAmount', 'occurrenceCount', 'firstOccurrenceDate', 'category', 'accountId'])
}

function reconciliationRecords(records, kind) {
  return records.map((record, index) => ({
    ...record,
    _analysisSourceId:record.id || record.transaction_id || '',
    id:`__pillar_analysis_${kind}_${index}`,
  }))
}

const reconciliationSourceId = record => (
  Object.prototype.hasOwnProperty.call(record || {}, '_analysisSourceId') ? record._analysisSourceId : record?.id || record?.transaction_id
)

function reconciliationCoverage(actualSource, dateKey) {
  const checkedDate = actualSource.checkedDate || dateKeyFromTimestamp(actualSource.checkedAt)
  const coverageThrough = actualSource.coverageThrough || checkedDate
  if (!actualSource.cacheValid) return { checkedDate, coverageThrough, reconciliation:'unavailable', reconciliationReason:'transaction-cache-unavailable' }
  if (actualSource.freshnessStatus !== 'fresh') return { checkedDate, coverageThrough, reconciliation:'unavailable', reconciliationReason:'transaction-source-not-fresh' }
  if (!coverageThrough || !parseISODate(coverageThrough)) return { checkedDate, coverageThrough:'', reconciliation:'unavailable', reconciliationReason:'coverage-date-unavailable' }
  if (dateKey > coverageThrough) return { checkedDate, coverageThrough, reconciliation:'unavailable', reconciliationReason:'date-after-source-coverage' }
  if (dateKey === coverageThrough) return { checkedDate, coverageThrough, reconciliation:'limited', reconciliationReason:'same-day-missing-conclusions-withheld' }
  return { checkedDate, coverageThrough, reconciliation:'available', reconciliationReason:'fresh-source-covers-later-date' }
}

function compactAnalysisTransaction(transaction, amount = amountOf(transaction?.amount)) {
  if (!transaction) return null
  return compactObject({
    id:transaction.id || transaction.transaction_id,
    name:transactionName(transaction),
    amount,
    date:transaction.date || transaction.occurrenceDate,
    category:transaction.category || transaction.cat,
    accountId:transaction.accountId || transaction.account_id || transaction.acct,
  }, ['id', 'name', 'amount', 'date', 'category', 'accountId'])
}

function reconciliationRowAmount(row) {
  if (row?.state?.includes('amount') && Number.isFinite(Number(row.amountVariance))) return Math.abs(Number(row.amountVariance))
  const expected = [row?.expected, ...valueArray(row?.expectedCandidates)]
  const actual = [row?.actual, ...valueArray(row?.candidates)]
  if (row?.state === 'unplanned-actual') return Math.max(0, ...actual.map(transaction => amountOf(transaction?.amount)))
  if (row?.state === 'missing-actual' || row?.state === 'pending-match' || row?.state === 'timing-variance') {
    return Math.max(0, ...expected.map(transaction => amountOf(transaction?.expectedAmount ?? transaction?.amount)))
  }
  return Math.max(0,
    ...expected.map(transaction => amountOf(transaction?.expectedAmount ?? transaction?.amount)),
    ...actual.map(transaction => amountOf(transaction?.amount)),
  )
}

function compactUnresolvedReconciliationRow(row) {
  if (!row) return null
  const expected = [row.expected, ...valueArray(row.expectedCandidates)].filter(Boolean)
  const actual = [row.actual, ...valueArray(row.candidates)].filter(Boolean)
  const representative = stableLargest([...expected, ...actual], transaction => amountOf(transaction?.expectedAmount ?? transaction?.amount))
  return compactObject({
    state:row.state,
    label:transactionName(representative),
    amount:row.state === 'ambiguous' ? undefined : reconciliationRowAmount(row),
    expectedIds:expected.map(reconciliationSourceId).filter(Boolean),
    actualIds:actual.map(reconciliationSourceId).filter(Boolean),
    date:representative?.occurrenceDate || representative?.date,
  }, ['state', 'label', 'amount', 'expectedIds', 'actualIds', 'date'])
}

function buildFinanceAnalysisSummary({ accounts = [], scheduled = [], actuals = [], budget = {}, asOfDate, actualSource = {} } = {}) {
  const dateKey = normalizedAnalysisDate(asOfDate)
  const today = parseISODate(dateKey)
  const actualsThroughDate = actuals.filter(transaction => parseISODate(transaction?.date) && transaction.date <= dateKey)
  const canonical = buildCanonicalFinanceModel({ accounts, scheduled, cashFlowScheduled:scheduled, actuals:actualsThroughDate, budget, today })
  const coverage = reconciliationCoverage(actualSource, dateKey)
  const reconciliationActuals = coverage.reconciliation === 'unavailable'
    ? []
    : actuals.filter(transaction => parseISODate(transaction?.date) && transaction.date <= coverage.coverageThrough)
  const rawReconciliation = coverage.reconciliation === 'unavailable'
    ? { rows:[] }
    : reconcileFinanceDay({
      scheduled:reconciliationRecords(scheduled, 'scheduled'),
      actuals:reconciliationRecords(reconciliationActuals, 'actual'),
      date:dateKey,
    })
  const reconciliationRows = rawReconciliation.rows.filter(row => (
    coverage.reconciliation !== 'limited' || row.state !== 'missing-actual'
  ))
  const reconciliationNeedsReview = reconciliationRows.filter(row => row.state !== 'matched')
  const reconciliationCounts = reconciliationRows.reduce((counts, row) => ({
    ...counts,
    [row.state]:(counts[row.state] || 0) + 1,
  }), {})
  const actualRows = canonical.breakdowns.actual
  const actualTransactionCount = actualRows.income.length + actualRows.otherInflows.length + actualRows.expenses.length
  const monthLines = scheduledMonthLines(scheduled, dateKey)
  const scheduledOccurrenceCount = monthLines.reduce((total, line) => total + line.occurrences.length, 0)
  const pendingRows = actualsThroughDate.filter(transaction => (
    transaction?.pending
    && transaction?.date?.startsWith(dateKey.slice(0, 7))
    && !isTransferTransaction(transaction)
  ))
  const postedExpenseRows = actualsThroughDate.filter(transaction => (
    !transaction?.pending
    && transaction?.date?.startsWith(dateKey.slice(0, 7))
    && transaction.date <= dateKey
    && !isTransferTransaction(transaction)
    && transactionDirection(transaction) === 'expense'
  ))
  const largestPosted = stableLargest(postedExpenseRows)
  const largestScheduledExpenseLine = stableLargest(
    monthLines.filter(line => line.transaction.type === 'expense'),
    line => line.monthlyAmount,
    line => transactionName(line.transaction),
  )
  const largestUnresolvedRow = stableLargest(reconciliationNeedsReview, reconciliationRowAmount, row => compactUnresolvedReconciliationRow(row)?.label || row?.state)
  const largestUnresolved = compactUnresolvedReconciliationRow(largestUnresolvedRow)
  const counts = Object.fromEntries(RECONCILIATION_STATES.map(state => [state, reconciliationCounts[state] || 0]))
  const knownReviewRows = reconciliationNeedsReview.filter(row => row.state !== 'ambiguous')
  const ambiguousGroupCount = reconciliationNeedsReview.length - knownReviewRows.length
  const pendingExpenseAmount = pendingRows.filter(transaction => transactionDirection(transaction) === 'expense').reduce((total, transaction) => total + amountOf(transaction.amount), 0)
  const pendingInflowAmount = pendingRows.filter(transaction => transactionDirection(transaction) === 'income').reduce((total, transaction) => total + amountOf(transaction.amount), 0)

  return {
    asOfDate:dateKey,
    sourceCoverage:{
      transactionCache:actualSource.cacheValid ? 'available' : 'unavailable',
      freshnessStatus:actualSource.freshnessStatus || 'unknown',
      checkedAt:actualSource.checkedAt || '',
      checkedDate:coverage.checkedDate || '',
      coverageThrough:coverage.coverageThrough || '',
      reconciliation:coverage.reconciliation,
      reconciliationReason:coverage.reconciliationReason,
    },
    actualMonthToDate:{
      income:canonical.metrics.actualMonthlyIncome,
      otherInflows:canonical.metrics.actualMonthlyOtherInflows,
      expenses:canonical.metrics.actualMonthlyExpenses,
      net:canonical.metrics.actualMonthlyNet,
      transactionCount:actualTransactionCount,
    },
    scheduledMonthBaseline:{
      income:canonical.metrics.projectedMonthlyIncome,
      expenses:canonical.metrics.projectedMonthlyExpenses,
      net:canonical.metrics.projectedMonthlyNet,
      scheduledLineCount:monthLines.length,
      occurrenceCount:scheduledOccurrenceCount,
    },
    reconciliation:{
      needsReviewCount:reconciliationNeedsReview.length,
      reviewAmounts:{
        knownGrossTotal:knownReviewRows.reduce((total, row) => total + reconciliationRowAmount(row), 0),
        ambiguousGroupCount,
        complete:ambiguousGroupCount === 0,
      },
      unresolvedExposureTotal:reconciliationNeedsReview
        .filter(row => ['missing-actual', 'unplanned-actual'].includes(row.state))
        .reduce((total, row) => total + reconciliationRowAmount(row), 0),
      exactMatchCount:counts.matched,
      counts,
      ...(largestUnresolved ? { largestUnresolved } : {}),
    },
    pending:{
      count:pendingRows.length,
      inflowAmount:pendingInflowAmount,
      expenseAmount:pendingExpenseAmount,
      grossAmount:pendingInflowAmount + pendingExpenseAmount,
      net:pendingInflowAmount - pendingExpenseAmount,
    },
    ...(largestPosted ? { largestPostedExpense:compactAnalysisTransaction(largestPosted) } : {}),
    ...(largestScheduledExpenseLine ? { largestScheduledExpenseLine:compactScheduledExpenseLine(largestScheduledExpenseLine) } : {}),
    accountCount:accounts.length,
  }
}

function buildHouseholdAnalysisSummary({ projects = [], calendar = {}, maintenance = {}, inventory = {}, schedule = {}, asOfDate } = {}) {
  const dateKey = normalizedAnalysisDate(asOfDate)
  const projectDueDate = project => project?.due || project?.dueDate || project?.targetDate || ''
  const openProjects = projects.filter(project => !/^(?:done|complete|completed|closed|cancelled|canceled)$/i.test(String(project?.status || '').trim()))
  const currentAppleEvents = calendar?.appleCalendarCoverage?.stale ? [] : valueArray(calendar?.appleFamilyCalendar)
  const events = [...valueArray(calendar?.brevityEvents), ...currentAppleEvents]
    .filter(event => String(event?.date || event?.start || '').slice(0, 10) === dateKey)
  const uniqueEvents = new Map(events.map(event => [`${event?.source || ''}:${event?.sourceId || event?.id || `${event?.title || ''}:${event?.time || ''}`}`, event]))
  const maintenanceState = normalizeHouseholdMaintenanceState({ ...maintenance, trackingStartedOn:maintenance?.trackingStartedOn || dateKey })
  const maintenanceDays = buildHouseholdMaintenanceWeek(dateKey)
  const maintenanceSummary = summarizeHouseholdMaintenance(maintenanceDays, maintenanceState, dateKey)
  const maintenanceAttention = maintenanceDays.flatMap(day => day.tasks.map(task => {
    const occurrence = householdOccurrence(maintenanceState, task)
    const taskDate = task.occurrenceId.slice(0, 10)
    const closed = task.signoffRequired ? Boolean(occurrence.approvedAt) : Boolean(occurrence.complete)
    const overdue = taskDate >= maintenanceState.trackingStartedOn && taskDate < dateKey && !closed
    const needsAttention = overdue || occurrence.returnedAt || occurrence.exception || (occurrence.submittedAt && !occurrence.approvedAt)
    return needsAttention ? compactObject({
      id:task.occurrenceId,
      title:task.title,
      date:taskDate,
      status:overdue ? 'Overdue' : occurrenceStatus(task, occurrence),
      exception:occurrence.exception,
      returnReason:occurrence.returnReason,
    }, ['id', 'title', 'date', 'status', 'exception', 'returnReason']) : null
  })).filter(Boolean).sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left.title).localeCompare(String(right.title)))
  const maintenanceToday = maintenanceDays.find(day => day.date === dateKey)?.tasks.flatMap(task => {
    const occurrence=householdOccurrence(maintenanceState, task)
    const closed=task.signoffRequired ? Boolean(occurrence.approvedAt) : Boolean(occurrence.complete)
    if(closed)return[]
    return [compactObject({
      id:task.occurrenceId,
      title:task.title,
      date:dateKey,
      status:occurrenceStatus(task, occurrence),
    }, ['id', 'title', 'date', 'status'])]
  }).slice(0, 4) || []
  const inventorySummary = inventoryIntelligence(inventory, { today:new Date(`${dateKey}T17:00:00.000Z`) })
  const scheduleState = normalizeHouseholdScheduleState(schedule)
  const blocksToday = scheduleState.blocks.filter(item => item?.date === dateKey && !isCancelledRecord(item))
  const routinesToday = routineOccurrencesForDate(scheduleState, dateKey)
  const priorityRank = value => /^(?:urgent|critical)$/i.test(String(value || '')) ? 0 : /^high$/i.test(String(value || '')) ? 1 : 2
  const attentionProjects = openProjects.filter(project => (
    priorityRank(project?.priority) < 2 || (projectDueDate(project) && projectDueDate(project) <= dateKey)
  )).sort((left, right) => (
    (projectDueDate(left) && projectDueDate(left) < dateKey ? 0 : 1) - (projectDueDate(right) && projectDueDate(right) < dateKey ? 0 : 1)
    || priorityRank(left?.priority) - priorityRank(right?.priority)
    || String(projectDueDate(left)).localeCompare(String(projectDueDate(right)))
    || String(left?.title || '').localeCompare(String(right?.title || ''))
  )).slice(0, 3).map(compactProject)
  const lowStockItems = [...inventorySummary.lowStock].sort((left, right) => (
    (Number(right.parLevel || 0) - Number(right.quantity || 0)) - (Number(left.parLevel || 0) - Number(left.quantity || 0))
    || String(left.name || '').localeCompare(String(right.name || ''))
  )).slice(0, 3).map(item => compactObject({ ...item, suggestedQuantity:Math.max(1, (Number(item.parLevel || 0) * 2) - Number(item.quantity || 0)) }, [
    'id', 'name', 'quantity', 'unit', 'parLevel', 'suggestedQuantity', 'expiresOn',
  ]))
  const expiringItems = [...inventorySummary.expired, ...inventorySummary.expiring]
    .sort((left, right) => String(left.expiresOn || '').localeCompare(String(right.expiresOn || '')) || String(left.name || '').localeCompare(String(right.name || '')))
    .slice(0, 3).map(item => compactObject(item, ['id', 'name', 'quantity', 'unit', 'expiresOn']))
  const todaySchedule = [...blocksToday, ...routinesToday]
    .sort((left, right) => `${left?.startTime || ''}:${left?.title || ''}`.localeCompare(`${right?.startTime || ''}:${right?.title || ''}`))
    .slice(0, 4).map(compactScheduleItem)
  const todayCalendarEvents = [...uniqueEvents.values()]
    .sort((left, right) => `${left?.time || ''}:${left?.title || ''}`.localeCompare(`${right?.time || ''}:${right?.title || ''}`))
    .slice(0, 4).map(compactCalendarEvent)

  return {
    asOfDate:dateKey,
    commitmentsToday:uniqueEvents.size,
    attentionProjects,
    lowStockItems,
    expiringItems,
    maintenanceAttention:maintenanceAttention.slice(0, 3),
    maintenanceToday,
    todaySchedule,
    todayCalendarEvents,
    projects:{
      open:openProjects.length,
      dueToday:openProjects.filter(project => projectDueDate(project) === dateKey).length,
      overdue:openProjects.filter(project => projectDueDate(project) && projectDueDate(project) < dateKey).length,
    },
    maintenance:{
      dueToday:maintenanceSummary.dueToday,
      approved:maintenanceSummary.approved,
      awaitingSignoff:maintenanceSummary.awaitingSignoff,
      overdue:maintenanceSummary.overdue,
      exceptions:maintenanceSummary.exceptions,
    },
    inventory:{
      lowStock:inventorySummary.lowStock.length,
      expiringSoon:inventorySummary.expiring.length,
      expired:inventorySummary.expired.length,
      monthlyWaste:inventorySummary.monthlyWaste,
    },
    schedule:{
      blocksToday:blocksToday.length,
      routinesToday:routinesToday.length,
      pendingInvitations:blocksToday.reduce((total, item) => total + Object.values(item.attendance || {}).filter(status => status === 'pending').length, 0),
    },
  }
}

function calendarContext(storage) {
  const legacy = safeJson(storage.getItem('family_calendar_events_v1') || '[]', [])
  const snapshot = safeJson(storage.getItem('brevity_icloud_calendar_cache_v1') || 'null', null)
  const appleEvents = Array.isArray(snapshot) ? snapshot : snapshot?.events
  const snapshotForHealth = Array.isArray(snapshot) ? { events:snapshot } : snapshot
  const health = calendarSnapshotHealth(snapshotForHealth)
  return {
    brevityEvents:canonicalRecords(valueArray(legacy).filter(value=>value&&typeof value==='object'&&!isCancelledRecord(value)).map(canonicalizeCalendarReadEvent).map(compactCalendarEvent), 300),
    appleFamilyCalendar:canonicalRecords(valueArray(appleEvents).filter(value=>value&&typeof value==='object'&&!isCancelledRecord(value)).map(compactCalendarEvent), 300),
    appleCalendarName:snapshot?.calendar || '',
    appleCalendarCoverage:compactObject({
      state:health.state,
      usable:health.usable,
      stale:health.stale,
      lastSuccessfulSyncAt:health.lastSuccessfulSyncAt,
      message:health.message,
      error:snapshotForHealth?.error,
      errorStatus:snapshotForHealth?.errorStatus,
    }, ['state', 'usable', 'stale', 'lastSuccessfulSyncAt', 'message', 'error', 'errorStatus']),
  }
}

function householdContext(storage, asOfDate) {
  const maintenance = valueObject(safeJson(storage.getItem('brevity_household_maintenance_v1') || '{}', {}))
  const rawInventory = valueObject(safeJson(storage.getItem('brevity_household_inventory_v1') || '{}', {}))
  const inventory = {...rawInventory,items:valueArray(rawInventory.items).filter(value=>value&&typeof value==='object'),waste:valueArray(rawInventory.waste).filter(value=>value&&typeof value==='object')}
  const rawSchedule = valueObject(safeJson(storage.getItem('brevity_household_schedule_v1') || '{}', {}))
  const schedule = {
    ...rawSchedule,
    blocks:valueArray(rawSchedule.blocks).filter(value=>value&&typeof value==='object'&&!isCancelledRecord(value)),
    routines:valueArray(rawSchedule.routines).filter(value=>value&&typeof value==='object').map(routine=>({...routine,days:valueArray(routine.days)})),
  }
  const occurrences = maintenance?.occurrences || maintenance?.completions || {}
  const projects = valueArray(safeJson(storage.getItem('homehq_items_v1') || '[]', [])).filter(value=>value&&typeof value==='object')
  const calendar = calendarContext(storage)
  return {
    analysisSummary:buildHouseholdAnalysisSummary({ projects, calendar, maintenance, inventory, schedule, asOfDate }),
    projects:canonicalRecords(projects.map(compactProject), 250),
    calendar,
    maintenance:{
      trackingStartedOn:maintenance?.trackingStartedOn || '',
      occurrences:Object.fromEntries(Object.entries(occurrences).map(([id, occurrence]) => [id, compactOccurrence(occurrence)])),
    },
    inventory:{
      items:canonicalRecords(valueArray(inventory?.items).map(compactInventoryItem), 200),
      waste:canonicalRecords(valueArray(inventory?.waste).map(compactWaste), 120),
    },
    schedule:{
      blocks:canonicalRecords(valueArray(schedule?.blocks).map(compactScheduleItem), 200),
      routines:canonicalRecords(valueArray(schedule?.routines).map(compactScheduleItem), 120),
      routineOverrides:schedule?.routineOverrides && typeof schedule.routineOverrides === 'object' ? schedule.routineOverrides : {},
    },
  }
}

const PILLAR_CONTEXT_NAMES = {
  spiritual:['spiritual','spiritual maturity'],
  health:['health','health & nutrition'],
  fitness:['fitness','physical fitness'],
  education:['education'],
  finance:['finance'],
  ministry:['ministry','ministry & fellowship'],
}

function scheduledPillarContext(storage,pillar,asOfDate) {
  const aliases=PILLAR_CONTEXT_NAMES[pillar]
  if(!aliases)return{}
  const dateKey=normalizedAnalysisDate(asOfDate)
  const raw=valueObject(safeJson(storage.getItem('brevity_household_schedule_v1') || '{}', {}))
  const schedule=normalizeHouseholdScheduleState({
    ...raw,
    blocks:valueArray(raw.blocks).filter(value=>value&&typeof value==='object'),
    routines:valueArray(raw.routines).filter(value=>value&&typeof value==='object').map(routine=>({...routine,days:valueArray(routine.days)})),
  })
  const matches=item=>aliases.includes(String(item?.pillar||'').trim().toLowerCase())
  const scheduleItems=[
    ...schedule.blocks.filter(item=>item.date===dateKey&&!isCancelledRecord(item)&&matches(item)),
    ...routineOccurrencesForDate(schedule,dateKey).filter(item=>!isCancelledRecord(item)&&matches(item)),
  ].sort((left,right)=>`${left?.startTime||''}:${left?.title||''}`.localeCompare(`${right?.startTime||''}:${right?.title||''}`)).slice(0,8).map(compactScheduleItem)
  const calendar=calendarContext(storage)
  const currentAppleEvents=calendar.appleCalendarCoverage?.stale ? [] : calendar.appleFamilyCalendar
  const calendarEvents=[...calendar.brevityEvents,...currentAppleEvents]
    .filter(item=>!isCancelledRecord(item)&&String(item?.date||item?.start||'').slice(0,10)===dateKey&&matches(item))
    .sort((left,right)=>`${left?.time||''}:${left?.title||''}`.localeCompare(`${right?.time||''}:${right?.title||''}`)).slice(0,8)
  return {scheduleItems,calendarEvents,appleCalendarCoverage:calendar.appleCalendarCoverage}
}

export function collectPillarContextFromStorage(pillar, storage, asOfDate = getHouseholdDateKey()) {
  if (!storage) return {}
  if (pillar === 'finance') {
    const rawFinance = valueObject(safeJson(storage.getItem('lslj_finance_v9') || '{}', {}))
    const finance = valueObject(migrateFinanceData({
      ...rawFinance,
      accounts:valueArray(rawFinance.accounts).filter(value => value && typeof value === 'object'),
      transactions:valueArray(rawFinance.transactions).filter(value => value && typeof value === 'object'),
    }))
    const actualsSource = storage.getItem('plaid_actuals_cache')
    const parsedActuals = safeJson(actualsSource || 'null', null)
    const actuals = Array.isArray(parsedActuals) ? parsedActuals : []
    const freshness = valueObject(safeJson(storage.getItem(TRANSACTION_FRESHNESS_KEY) || '{}', {}))
    const actualSource = {
      cacheValid:actualsSource !== null && Array.isArray(parsedActuals),
      freshnessStatus:['fresh','partial','stale'].includes(freshness.status) ? freshness.status : 'unknown',
      checkedAt:freshness.checkedAt || '',
      checkedDate:dateKeyFromTimestamp(freshness.checkedAt),
      coverageThrough:parseISODate(freshness.coverageThrough) ? freshness.coverageThrough : dateKeyFromTimestamp(freshness.checkedAt),
    }
    const budgets = valueObject(safeJson(storage.getItem('lslj_budget_v1') || '{}', {}))
    const budgetActuals = valueObject(safeJson(storage.getItem('lslj_actuals_v1') || '{}', {}))
    const transactionOverrides = valueObject(safeJson(storage.getItem('lslj_tx_overrides_v1') || '{}', {}))
    const transactionRules = safeJson(storage.getItem('lslj_tx_rules_v1') || '[]', [])
    const goals = safeJson(storage.getItem('fp_goals') || '[]', [])
    const accounts = valueArray(finance.accounts).filter(account => account && typeof account === 'object')
    const scheduled = valueArray(finance.transactions).filter(transaction => transaction && typeof transaction === 'object')
    const correctedActuals = valueArray(actuals)
      .filter(transaction => transaction && typeof transaction === 'object')
      .map(transaction => applyTransactionRules(transaction, valueArray(transactionRules), accounts))
      .map(transaction => {
        const override=valueObject(transactionOverrides[transaction.id])
        return Object.keys(override).length ? {
          ...transaction,
          ...(typeof override.name === 'string' ? { name:override.name } : {}),
          ...(typeof override.category === 'string' ? { category:override.category } : {}),
          ...(override._deleted === true ? { _deleted:true } : {}),
        } : transaction
      })
      .filter(transaction => !transaction._deleted)
      .map(compactTransaction)
    const dateKey=normalizedAnalysisDate(asOfDate)
    const monthPrefix=dateKey.slice(0,7)
    const scopedActuals=correctedActuals.filter(transaction => (
      parseISODate(transaction?.date)
      && transaction.date.startsWith(monthPrefix)
      && transaction.date <= dateKey
      && !isTransferTransaction(transaction)
    ))
    const scopedScheduled=scheduledMonthLines(scheduled,dateKey).map(line=>line.transaction)
    return {
      analysisSummary:buildFinanceAnalysisSummary({ accounts, scheduled, actuals:correctedActuals, budget:budgets, asOfDate, actualSource }),
      accounts:canonicalRecords(accounts.map(compactAccount), 50),
      scheduledTransactions:canonicalRecords(scopedScheduled.map(compactTransaction), 250),
      actualTransactions:recentRecords(scopedActuals, 250),
      actualTransactionCount:correctedActuals.length,
      sourceActualTransactionCount:valueArray(actuals).length,
      budgets,
      budgetActuals,
      transactionOverrides:canonicalRecords(Object.entries(transactionOverrides).map(([id, override]) => ({ id, ...compactTransaction(override), _deleted:Boolean(override?._deleted) })), 250),
      transactionRules:canonicalRecords(valueArray(transactionRules).map(compactRule), 100),
      goals:canonicalRecords(valueArray(goals), 100),
      ...scheduledPillarContext(storage,'finance',asOfDate),
    }
  }
  if (pillar === 'household') return householdContext(storage, asOfDate)
  if (PILLAR_CONTEXT_NAMES[pillar]) return scheduledPillarContext(storage,pillar,asOfDate)
  return {}
}

export function collectPillarContext(pillar, asOfDate = getHouseholdDateKey()) {
  if (typeof window === 'undefined') return {}
  return collectPillarContextFromStorage(pillar, window.localStorage, asOfDate)
}

export async function generatePillarAnalysis({
  pillar,
  date,
  plan,
  currentMember,
  force = false,
  localContext = collectPillarContext(pillar, date),
  fetcher = globalThis.fetch,
  storage = globalThis.localStorage,
  eventTarget = globalThis.window,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const contextSignature = pillarAnalysisContextSignature({ pillarData:plan?.[pillar] || {}, localContext })
  const requestScope = `${date}:${pillar}:${memberSegment(currentMember)}`
  const requestToken = Symbol(requestScope)
  latestRequests.set(requestScope, requestToken)
  const isLatest = () => latestRequests.get(requestScope) === requestToken
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs)&&timeoutMs>=0?timeoutMs:REQUEST_TIMEOUT_MS)
  let response,body
  try {
    response = await fetcher(ENDPOINT, {
      method:'POST',
      credentials:'include',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ pillar, date, plan, currentMember, force, localContext, contextSignature }),
      signal:controller.signal,
    })
    try{body=await response.json()}
    catch(error){if(controller.signal.aborted)throw Object.assign(new Error('Pillar analysis response timed out.'),{name:'AbortError'});if(error?.name==='AbortError')throw error;body={}}
  } catch (error) {
    if (!isLatest()) return null
    if (error?.name === 'AbortError') throw new Error(`${pillar} analysis timed out; the last saved analysis remains available.`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  if (!isLatest()) return null
  if (!response.ok) {
    const error = new Error(body.error || `Brevity AI returned ${response.status}.`)
    error.status = response.status
    throw error
  }
  if (body.contextSignature !== contextSignature) throw new Error('The pillar analysis source changed while Brevity was preparing it. Refresh the analysis to use the latest household data.')
  if (memberSegment(body.member) !== memberSegment(currentMember)) throw new Error('The pillar analysis was prepared for a different signed-in household member. Refresh after confirming the active profile.')
  if (isLatest()) {
    try { storage?.setItem?.(pillarAnalysisStorageKey(date, pillar, currentMember), JSON.stringify(body)) } catch {}
    try {
      if (eventTarget?.dispatchEvent) {
        const event = typeof CustomEvent === 'function'
          ? new CustomEvent(PILLAR_ANALYSIS_EVENT, { detail: body })
          : { type:PILLAR_ANALYSIS_EVENT, detail:body }
        eventTarget.dispatchEvent(event)
      }
    } catch {}
  }
  return body
}

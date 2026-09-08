import { calculateTransactionAmountForMonth } from './monthlyCashFlow.js'
import { budgetCategoryForTransaction } from './reportingData.js'

export const BUDGET_SCHEMA_VERSION = 2

const CATEGORY_ORDER = ['Housing','Utilities','Transportation','Insurance','Health','Debt','Food','Household','Family','Subscriptions','Discretionary','Other']
const UNASSIGNED_ACCOUNT = 'unassigned'

const stringValue = value => String(value ?? '').trim()
const accountIdFor = transaction => stringValue(transaction?.acct || transaction?.accountId) || UNASSIGNED_ACCOUNT

function stableHash(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function budgetLineId(transaction = {}) {
  const accountId = accountIdFor(transaction)
  const recordId = stringValue(transaction.id)
  if (recordId) return `${accountId}:${recordId}`
  const identity = [accountId, transaction.type, transaction.cat, transaction.name, transaction.freq, transaction.start, transaction.end].map(stringValue).join('|')
  return `${accountId}:generated-${stableHash(identity)}`
}

function budgetLineFromTransaction(transaction) {
  const direction = transaction.type
  return {
    id: budgetLineId(transaction),
    recordId: stringValue(transaction.id),
    accountId: accountIdFor(transaction),
    name: stringValue(transaction.name) || 'Unnamed budget line',
    category: direction === 'income' ? 'Income' : stringValue(transaction.cat) || 'Other',
    direction,
    transactions: [transaction],
  }
}

function storedBudgetLines(budget = {}, accountIds = null) {
  if (Number(budget?.schemaVersion) !== BUDGET_SCHEMA_VERSION || !budget?.lines || typeof budget.lines !== 'object') return []
  const selected = accountIds ? new Set([...accountIds].map(String)) : null
  return Object.entries(budget.lines).flatMap(([id, value]) => {
    if (!value || !['income', 'expense'].includes(value.direction)) return []
    const accountId = stringValue(value.accountId) || UNASSIGNED_ACCOUNT
    if (selected && !selected.has(accountId)) return []
    return [{
      id,
      recordId: stringValue(value.recordId),
      accountId,
      name: stringValue(value.name) || 'Unnamed budget line',
      category: value.direction === 'income' ? 'Income' : stringValue(value.category) || 'Other',
      direction: value.direction,
      transactions: [],
    }]
  })
}

export function buildBudgetLines(transactions = [], budget = {}, { accountIds = null } = {}) {
  const lines = new Map()
  const selected = accountIds ? new Set([...accountIds].map(String)) : null
  transactions
    .filter(transaction => (
      transaction?.freq !== 'once'
      && ['income', 'expense'].includes(transaction?.type)
      && (!selected || selected.has(accountIdFor(transaction)))
    ))
    .forEach(transaction => {
      const next = budgetLineFromTransaction(transaction)
      const current = lines.get(next.id)
      if (current) current.transactions.push(transaction)
      else lines.set(next.id, next)
    })

  for (const stored of storedBudgetLines(budget, accountIds)) {
    if (!lines.has(stored.id)) lines.set(stored.id, stored)
  }
  return [...lines.values()].sort((left, right) => (
    left.category.localeCompare(right.category)
    || left.name.localeCompare(right.name, undefined, { sensitivity:'base' })
    || left.id.localeCompare(right.id)
  ))
}

export function buildBudgetCategoryLines(transactions = [], budget = {}, options = {}) {
  const result = {}
  const expenses = {}
  const lines = buildBudgetLines(transactions, budget, options)
  const income = lines.filter(line => line.direction === 'income')
  if (income.length) result.Income = income

  for (const line of lines.filter(item => item.direction === 'expense')) {
    if (!expenses[line.category]) expenses[line.category] = []
    expenses[line.category].push(line)
  }
  CATEGORY_ORDER.forEach(category => { if (expenses[category]) result[category] = expenses[category] })
  Object.keys(expenses).filter(category => !CATEGORY_ORDER.includes(category)).sort().forEach(category => { result[category] = expenses[category] })
  return result
}

// Retained for callers that need display names only. Calculations use stable
// line records so two recurring records with the same name never share state.
export function buildBudgetCategoryItems(transactions = []) {
  return Object.fromEntries(Object.entries(buildBudgetCategoryLines(transactions)).map(([category, lines]) => [
    category,
    [...new Set(lines.map(line => line.name))],
  ]))
}

function legacyRows(budget = {}) {
  const source = Number(budget?.schemaVersion) === BUDGET_SCHEMA_VERSION ? budget?.legacy?.rows : budget
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  return Object.fromEntries(Object.entries(source).filter(([, row]) => Array.isArray(row)).map(([name, row]) => [name, [...row]]))
}

export function buildLegacyBudgetOwners(lines = []) {
  const owners = new Map()
  for (const line of [...lines].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!owners.has(line.name)) owners.set(line.name, line.id)
  }
  return owners
}

export function budgetTargetForLine({
  budget = {}, line, year, month, legacyYear, legacyAccountId, legacyOwners = new Map(),
} = {}) {
  if (!line || !Number.isInteger(Number(year)) || !Number.isInteger(Number(month))) return undefined
  const exact = budget?.targets?.[line.accountId]?.[String(year)]?.[line.id]?.[month]
  if (exact !== undefined && exact !== null && exact !== '') return Number(exact) || 0

  const legacy = Number(budget?.schemaVersion) === BUDGET_SCHEMA_VERSION ? budget?.legacy : null
  const effectiveLegacyYear = Number(legacy?.year ?? legacyYear)
  const effectiveLegacyAccount = stringValue(legacy?.accountId || legacyAccountId)
  if (Number(year) !== effectiveLegacyYear || line.accountId !== effectiveLegacyAccount) return undefined
  if (legacyOwners.get(line.name) !== line.id) return undefined
  const value = legacyRows(budget)?.[line.name]?.[month]
  return value === undefined || value === null || value === '' ? undefined : Number(value) || 0
}

export function budgetTargetRow(options = {}) {
  return Array.from({ length: 12 }, (_, month) => budgetTargetForLine({ ...options, month }))
}

export function applyBudgetTarget(value = {}, payload = {}, { migrationYear = new Date().getUTCFullYear() } = {}) {
  const month = Number(payload.month)
  const year = Number(payload.year)
  const lineId = stringValue(payload.lineId)
  const accountId = stringValue(payload.accountId)
  const direction = stringValue(payload.direction)
  if (!lineId || !accountId || !Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 0 || month > 11 || !['income', 'expense'].includes(direction)) {
    throw new Error('A stable budget line, account, year, direction, and month from 0 through 11 are required.')
  }

  const isV2 = Number(value?.schemaVersion) === BUDGET_SCHEMA_VERSION
  const next = isV2
    ? {
        ...value,
        targets:{ ...(value.targets || {}) },
        lines:{ ...(value.lines || {}) },
        legacy:value.legacy ? { ...value.legacy, rows:{ ...(value.legacy.rows || {}) } } : undefined,
      }
    : {
        schemaVersion:BUDGET_SCHEMA_VERSION,
        targets:{},
        lines:{},
        legacy:{
          rows:legacyRows(value),
          year:Number(payload.legacyYear) || migrationYear,
          accountId:stringValue(payload.legacyAccountId) || accountId,
        },
      }

  const accountTargets = { ...(next.targets[accountId] || {}) }
  const yearTargets = { ...(accountTargets[String(year)] || {}) }
  const row = Array.isArray(yearTargets[lineId]) ? [...yearTargets[lineId]] : Array(12).fill(null)
  row[month] = Number(payload.value ?? payload.amount) || 0
  yearTargets[lineId] = row
  accountTargets[String(year)] = yearTargets
  next.targets[accountId] = accountTargets
  next.lines[lineId] = {
    ...(next.lines[lineId] || {}),
    recordId:stringValue(payload.recordId),
    accountId,
    name:stringValue(payload.lineName) || stringValue(next.lines[lineId]?.name) || 'Unnamed budget line',
    category:direction === 'income' ? 'Income' : stringValue(payload.category) || stringValue(next.lines[lineId]?.category) || 'Other',
    direction,
  }
  return next
}

export function allocateBudgetActuals(actuals = [], lines = []) {
  const byLine = {}
  const unallocatedByCategory = {}
  const normalize = value => stringValue(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const candidatesByCategory = lines.reduce((map, line) => {
    if (!map.has(line.category)) map.set(line.category, [])
    map.get(line.category).push({ line, name:normalize(line.name) })
    return map
  }, new Map())

  for (const transaction of actuals) {
    const category = budgetCategoryForTransaction(transaction)
    if (!category) continue
    const amount = Math.abs(Number(transaction.amount) || 0)
    const actualName = normalize(transaction.merchant_name || transaction.merchant || transaction.name)
    const candidates = candidatesByCategory.get(category) || []
    const exact = actualName ? candidates.filter(candidate => candidate.name === actualName) : []
    const contains = exact.length ? [] : candidates.filter(candidate => actualName && candidate.name && (actualName.includes(candidate.name) || candidate.name.includes(actualName)))
    const matches = exact.length ? exact : contains
    if (matches.length === 1) byLine[matches[0].line.id] = (byLine[matches[0].line.id] || 0) + amount
    else unallocatedByCategory[category] = (unallocatedByCategory[category] || 0) + amount
  }
  return { byLine, unallocatedByCategory }
}

export function buildBudgetBreakdown({ transactions = [], budget = {}, month = new Date(), direction, legacyYear, legacyAccountId, accountIds = null }) {
  const monthIndex = month.getMonth()
  const year = month.getFullYear()
  const monthDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`
  const lines = buildBudgetLines(transactions, budget, { accountIds })
  const legacyOwners = buildLegacyBudgetOwners(lines)

  return lines.filter(line => line.direction === direction).map(line => {
    const override = budgetTargetForLine({ budget, line, year, month:monthIndex, legacyYear, legacyAccountId, legacyOwners })
    const amount = override !== undefined
      ? override
      : line.transactions.reduce((sum, transaction) => (
          sum + calculateTransactionAmountForMonth(transaction, month, { recurringOnly:true })
        ), 0)
    return {
      id:`budget-${line.id}-${year}-${monthIndex + 1}`,
      budgetLineId:line.id,
      name:line.name,
      type:direction,
      cat:line.category,
      acct:line.accountId,
      freq:'budgeted',
      amount,
      date:monthDate,
      budgetLine:true,
    }
  }).filter(line => line.amount !== 0)
}

export function budgetBreakdownTotal(lines = []) {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
}

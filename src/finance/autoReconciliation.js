import {incomeSourceMatches} from './cashSourceIdentity.js'
import { addDays, parseISODate, toISO, txOccursOnDate } from './projection.js'
import { normalizeMerchantName } from './financialTruth.js'
import { isTransferTransaction } from './reportingData.js'
import { buildUniquePlaidAccountMap } from './calendarSemantics.js'
import { getHouseholdDateKey } from './financeTime.js'

export const RECONCILIATION_BATCH_LIMIT = 8
export const cents = value => Math.round(Number(value) * 100)
const bankName = actual => String(actual?.originalStatement || actual?.name || actual?.merchant_name || '')
const ignored = new Set(['bank','draft','electric','utility','utilities','bill','debit','credit','card','ach','the','emc','loan','personal','marketplace','insurance','life','fuel','dues'])
function vendorMatches(plan, actual) {
  if (plan.vendorId && actual.vendorId) return plan.vendorId === actual.vendorId
  if (plan.type === 'income') return incomeSourceMatches(plan,actual)
  const left = normalizeMerchantName(plan), right = normalizeMerchantName(actual)
  if (!left || !right) return false
  if (left === right) return true
  const tokens = text => text.split(' ').filter(t => t.length >= 4 && !ignored.has(t) && !/\d/.test(t))
  const a = tokens(left), b = new Set(tokens(right))
  return a.some(t => b.has(t))
}
export function reconciliationEvidence(plan, actual, occurrenceDate) {
  return { actualId:actual.id, bankAccountId:actual.accountId, postedDate:actual.date, actualAmount:Number(actual.amount), bankName:bankName(actual), budgetAmount:Number(plan.amount), originalDate:occurrenceDate }
}
export function normalizeReconciliationEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A reconciliation needs the reviewed bank charge.')
  const keys = ['actualId','bankAccountId','postedDate','actualAmount','bankName','budgetAmount','originalDate']
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unsupported reconciliation evidence.')
  for (const key of ['actualId','bankAccountId','bankName']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 1000) throw new Error('Invalid reconciliation bank identity.')
  for (const key of ['postedDate','originalDate']) if (!parseISODate(value[key])) throw new Error('Invalid reconciliation date.')
  for (const key of ['actualAmount','budgetAmount']) if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || (key === 'actualAmount' ? value[key] === 0 : value[key] <= 0)) throw new Error('Invalid reconciliation amount.')
  return Object.fromEntries(keys.map(key => [key,value[key]]))
}
export function approvedReconciliationMatches(plan, actual, date, accountMap) {
  const saved = plan?.reconciliation
  return Boolean(saved && !actual.pending && saved.actualId === actual.id && saved.bankAccountId === actual.accountId
    && saved.postedDate === actual.date && date === actual.date && plan.freq === 'once' && plan.start === date
    && cents(saved.actualAmount) === cents(actual.amount) && cents(saved.budgetAmount) === cents(plan.amount)
    && saved.bankName === bankName(actual) && (!accountMap || accountMap[actual.accountId] === plan.acct))
}

// Assessment only. No writes, date changes, or inferred approvals happen here.
export function buildAutoReconciliationReport({ scheduled = [], actuals = [], accounts = [], today = getHouseholdDateKey(), lookbackDays = 30, allowAmountVariance = false } = {}) {
  const end = parseISODate(today)
  if (!end) return { suggestions:[], ambiguous:[], unresolved:[] }
  const from = toISO(addDays(end,-lookbackDays)), accountMap = buildUniquePlaidAccountMap(accounts)
  const approvedIds = new Set(scheduled.flatMap(plan => actuals.filter(actual => approvedReconciliationMatches(plan,actual,actual.date,accountMap)).map(actual => actual.id)))
  const bank = actuals.filter(actual => actual.id && actual.date >= from && actual.date <= today && parseISODate(actual.date)
    && !actual.pending && Number.isFinite(Number(actual.amount)) && Number(actual.amount) !== 0 && accountMap[actual.accountId] && !approvedIds.has(actual.id))
  const candidates = []
  for (const actual of bank) {
    const posting = parseISODate(actual.date)
    for (const plan of scheduled) {
      if (!['expense','income'].includes(plan.type) || (plan.type === 'income' ? Number(actual.amount)>=0 : Number(actual.amount)<=0 || isTransferTransaction(actual)) || plan.acct !== accountMap[actual.accountId] || plan.reconciliation || !vendorMatches(plan,actual)) continue
      const variance = Math.abs(cents(actual.amount)) - cents(plan.amount)
      // Roughly equal: within 2%, capped at $25, with a $2 minimum tolerance.
      const tolerance = Math.max(200, Math.min(2500, Math.round(cents(plan.amount) * .02)))
      // Different amounts can still identify a bill, but a fee or a tiny
      // fraction of the expected payment is not evidence of paying that bill.
      if (allowAmountVariance && (Math.abs(variance) > cents(plan.amount) * .5
        || /\b(return fee|late fee|service fee|processing fee|nsf|overdraft)\b/i.test(`${actual.name || ''} ${actual.originalStatement || ''}`))) continue
      if (!Number.isFinite(variance) || Number(plan.amount) <= 0 || (!allowAmountVariance && Math.abs(variance) > tolerance)) continue
      for (let offset=-7;offset<=7;offset++) {
        const date=addDays(posting,offset)
        if (!txOccursOnDate(plan,date)) continue
        const occurrenceDate=toISO(date)
        candidates.push({ id:`${plan.id}:${occurrenceDate}:${actual.id}`, plan, actual, occurrenceDate,
          amountVariance:variance/100, timingDays:-offset, evidence:reconciliationEvidence(plan,actual,occurrenceDate),
          reason:`Same linked account and matching vendor; ${variance === 0 ? 'exact amount' : Math.abs(variance) <= tolerance ? 'amount within tolerance' : 'different amount; review variance'}; ${Math.abs(offset)} day date difference.` })
      }
    }
  }
  const planCounts = new Map(), bankCounts = new Map()
  for(const row of candidates){const key=`${row.plan.id}:${row.occurrenceDate}`;planCounts.set(key,(planCounts.get(key)||0)+1);bankCounts.set(row.actual.id,(bankCounts.get(row.actual.id)||0)+1)}
  const unique = row => planCounts.get(`${row.plan.id}:${row.occurrenceDate}`)===1 && bankCounts.get(row.actual.id)===1
  const suggestions=candidates.filter(unique).sort((a,b)=>b.actual.date.localeCompare(a.actual.date))
  const ambiguous=candidates.filter(row=>!unique(row))
  const candidateIds = new Set(candidates.map(row=>row.actual.id))
  return { suggestions, ambiguous, unresolved:bank.filter(actual=>!candidateIds.has(actual.id)), from, through:today }
}
export function reconciliationOperation(row) {
  return { type:'recurring.update', targetId:row.plan.id, targetDate:row.occurrenceDate,
    allowedScopes:['this-item'], defaultScope:'this-item',
    description:`Reconcile ${row.plan.name}: budget $${Number(row.plan.amount).toFixed(2)} on ${row.occurrenceDate}; posted $${Math.abs(Number(row.actual.amount)).toFixed(2)} on ${row.actual.date}; difference $${row.amountVariance.toFixed(2)}. Move only this occurrence to ${row.actual.date}, retain its budget amount, and link the bank transaction. Future occurrences stay unchanged.`,
    payload:{date:row.actual.date,reconciliation:row.evidence} }
}

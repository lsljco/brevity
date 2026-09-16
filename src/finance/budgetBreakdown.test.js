import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  allocateBudgetActuals,
  applyBudgetTarget,
  budgetBreakdownTotal,
  budgetTargetForLine,
  buildBudgetBreakdown,
  buildBudgetCategoryItems,
  buildBudgetLines,
  buildLegacyBudgetOwners,
} from './budgetBreakdown.js'

const financeSource = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')

test('Budget restores the selected month after a drill-down', () => {
  assert.match(financeSource, /initialMonth=\{transactionFilter\?\.budgetMonth\}/)
  assert.match(financeSource, /budgetMonth:\s*monthKey/)
  assert.match(financeSource, /new Date\(Number\(initialMonth\.slice\(0, 4\)\), Number\(initialMonth\.slice\(5, 7\)\) - 1, 1\)/)
})

test('display categories can collapse repeated names without collapsing stable budget records', () => {
  const transactions = [
    { id:'payroll-a', acct:'operating', name:'Payroll', type:'income', freq:'weekly' },
    { id:'payroll-once', acct:'operating', name:'Payroll', type:'income', freq:'once' },
    { id:'payroll-b', acct:'operating', name:'Payroll', type:'income', freq:'monthly' },
    { id:'utilities-a', acct:'operating', name:'Utilities', cat:'Housing', type:'expense', freq:'monthly' },
    { id:'utilities-b', acct:'operating', name:'Utilities', cat:'Housing', type:'expense', freq:'weekly' },
  ]
  assert.deepEqual(buildBudgetCategoryItems(transactions), { Income:['Payroll'], Housing:['Utilities'] })
  assert.deepEqual(buildBudgetLines(transactions).map(line => line.id), [
    'operating:utilities-a',
    'operating:utilities-b',
    'operating:payroll-a',
    'operating:payroll-b',
  ])
})

test('budget breakdown totals each stable series occurrence in the selected month', () => {
  const lines = buildBudgetBreakdown({
    month:new Date(2026, 8, 1),
    direction:'income',
    transactions:[
      { id:'weekly', acct:'operating', name:'Weekly income', type:'income', freq:'weekly', start:'2026-09-04', amount:500 },
      { id:'monthly', acct:'operating', name:'Monthly income', type:'income', freq:'monthly', start:'2026-09-15', amount:1000 },
      { id:'expense', acct:'operating', name:'Expense', type:'expense', freq:'monthly', start:'2026-09-01', amount:200 },
    ],
  })

  assert.deepEqual(lines.map(line => [line.name, line.amount]), [['Monthly income', 1000], ['Weekly income', 2000]])
  assert.ok(lines.every(line => line.date === '2026-09-01'))
  assert.equal(budgetBreakdownTotal(lines), 3000)
})

test('v2 budget targets isolate duplicate names by stable line, account, and year', () => {
  const operating = { id:'operating:phone', recordId:'phone', accountId:'operating', name:'Phone', category:'Utilities', direction:'expense', transactions:[] }
  const savings = { ...operating, id:'savings:phone', accountId:'savings' }
  let budget = applyBudgetTarget({}, {
    month:8, year:2026, value:450, lineId:operating.id, recordId:'phone', lineName:'Phone', category:'Utilities', direction:'expense', accountId:'operating', legacyYear:2026, legacyAccountId:'operating',
  })
  budget = applyBudgetTarget(budget, {
    month:8, year:2027, value:500, lineId:operating.id, recordId:'phone', lineName:'Phone', category:'Utilities', direction:'expense', accountId:'operating',
  })
  budget = applyBudgetTarget(budget, {
    month:8, year:2026, value:25, lineId:savings.id, recordId:'phone', lineName:'Phone', category:'Utilities', direction:'expense', accountId:'savings',
  })

  assert.equal(budgetTargetForLine({ budget, line:operating, year:2026, month:8 }), 450)
  assert.equal(budgetTargetForLine({ budget, line:operating, year:2027, month:8 }), 500)
  assert.equal(budgetTargetForLine({ budget, line:savings, year:2026, month:8 }), 25)

  const operatingBreakdown = buildBudgetBreakdown({
    budget,
    month:new Date(2026, 8, 1),
    direction:'expense',
    accountIds:new Set(['operating']),
    transactions:[
      { id:'phone', acct:'operating', name:'Phone', cat:'Utilities', type:'expense', freq:'monthly', start:'2026-09-01', amount:400 },
      { id:'phone', acct:'savings', name:'Phone', cat:'Utilities', type:'expense', freq:'monthly', start:'2026-09-01', amount:25 },
      { id:'other', acct:'savings', name:'Savings-only fee', cat:'Other', type:'expense', freq:'monthly', start:'2026-09-01', amount:75 },
    ],
  })
  assert.deepEqual(operatingBreakdown.map(line => [line.budgetLineId, line.amount]), [['operating:phone', 450]])
  assert.equal(budgetBreakdownTotal(operatingBreakdown), 450)
})

test('legacy v1 targets migrate once to the operating account and current year', () => {
  const lines = [
    { id:'operating:phone-a', accountId:'operating', name:'Phone' },
    { id:'operating:phone-b', accountId:'operating', name:'Phone' },
    { id:'savings:phone', accountId:'savings', name:'Phone' },
  ]
  const owners = buildLegacyBudgetOwners(lines)
  const legacy = { Phone:[0,0,0,0,0,0,0,0,400] }
  const values = lines.map(line => budgetTargetForLine({ budget:legacy, line, year:2026, month:8, legacyYear:2026, legacyAccountId:'operating', legacyOwners:owners }))
  assert.deepEqual(values, [400, undefined, undefined])

  const migrated = applyBudgetTarget(legacy, {
    month:8, year:2026, value:450, lineId:'operating:phone-b', recordId:'phone-b', lineName:'Phone', category:'Utilities', direction:'expense', accountId:'operating', legacyYear:2026, legacyAccountId:'operating',
  })
  assert.deepEqual(migrated.legacy, { rows:legacy, year:2026, accountId:'operating' })
  assert.equal(migrated.targets.operating['2026']['operating:phone-b'][8], 450)
})

test('actual allocation assigns each bank row at most once and exposes ambiguity', () => {
  const lines = [
    { id:'amazon', name:'Amazon', category:'Discretionary' },
    { id:'prime', name:'Amazon Prime', category:'Discretionary' },
  ]
  const result = allocateBudgetActuals([
    { amount:16.15, category:'GENERAL_MERCHANDISE', merchant_name:'Amazon Prime' },
    { amount:50, category:'GENERAL_MERCHANDISE', merchant_name:'Amazon' },
    { amount:25, category:'GENERAL_MERCHANDISE', merchant_name:'Amazon Marketplace' },
    { amount:10, category:'GENERAL_MERCHANDISE', merchant_name:'Unrecognized merchant' },
  ], lines)
  assert.deepEqual(result.byLine, { prime:16.15, amazon:75 })
  assert.deepEqual(result.unallocatedByCategory, { Discretionary:10 })
  assert.equal(Object.values(result.byLine).reduce((sum, amount) => sum + amount, 0) + result.unallocatedByCategory.Discretionary, 101.15)
})

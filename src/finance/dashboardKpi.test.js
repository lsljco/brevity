import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')

test('dashboard income and expense cards use matching timeframe drill-downs', () => {
  assert.match(source, /dashboardIncome = showActuals \? actualRangeTotals\.income : expectedRangeTotals\.income/)
  assert.match(source, /dashboardExpense = showActuals \? actualRangeTotals\.expenses : expectedRangeTotals\.expenses/)
  assert.match(source, /openFilteredTransactions\(\{ direction:'income', realizedIncomeOnly:true, label:'Realized income' \}\)/)
  assert.match(source, /openScheduledTransactions\(\{ direction:'income', label:'Expected income' \}\)/)
  assert.match(source, /openFilteredTransactions\(\{ direction:'expense', postedOnly:true, label:'Posted expenses' \}\)/)
  assert.match(source, /openScheduledTransactions\(\{ direction:'expense', label:'Projected expenses' \}\)/)
})

test('dashboard cash flow and 90-day floor drill into their own supporting records', () => {
  assert.match(source, /dashboardCashFlow = showActuals \? actualRangeTotals\.net : expectedRangeTotals\.net/)
  assert.match(source, /openFilteredTransactions\(\{ excludeTransfers:true, postedOnly:true, label:'Posted cash flow' \}\)/)
  assert.match(source, /openScheduledTransactions\(\{ label:'Expected cash flow' \}\)/)
  assert.match(source, /setCalMonth\(minDay\.getMonth\(\)\); setCalYear\(minDay\.getFullYear\(\)\)/)
})

test('scheduled timeframe drill-downs display occurrence totals instead of one base amount', () => {
  assert.match(source, /buildScheduledTransactionRows\(fd\.transactions, financeRange, transactionFilter, transactionListOptions\)/)
  assert.match(source, /fmtMoney\(tx\.rangeAmount \?\? tx\.amount\)/)
  assert.match(source, /occurrence.*in timeframe/)
})

test('dashboard labels distinguish expected income and all projected expenses', () => {
  assert.doesNotMatch(source, /Monthly Net Income/)
  assert.match(source, /showActuals \? 'Realized Income' : 'Expected Income'/)
  assert.match(source, /showActuals \? 'Posted Expenses' : 'Projected Expenses'/)
  assert.match(source, /projectedExpenseSources\.length/)
  assert.match(source, /Recurring baseline cash flow/)
  assert.match(source, /One-time items are excluded/)
})

test('dashboard icon buttons expose explicit accessible names', () => {
  assert.match(source, /aria-label="Open upcoming financial calendar"/)
  assert.match(source, /aria-label="Add transaction"/)
})

test('fresh household data treats property taxes as an annual obligation', () => {
  assert.match(source, /id: 't_h6',[^\n]+name: 'Property Taxes',[^\n]+freq: 'yearly'/)
  assert.doesNotMatch(source, /id: 't_h6',[^\n]+name: 'Property Taxes',[^\n]+freq: 'monthly'/)
})

test('dashboard baselines, budget health, and sparklines follow the selected account scope', () => {
  assert.match(source, /calculateMonthlyCashFlow\(fd\.transactions, todayKey\)/)
  assert.match(source, /const incomeSources = fd\.transactions/)
  assert.match(source, /calculateMonthlyCashFlow\(fd\.transactions, month\)/)
  assert.match(source, /buildScheduledTransactionRows\(fd\.transactions, financeRange/)
})

test('realized-income labels consistently describe posted income only', () => {
  assert.match(source, /trend:showActuals \? 'posted income'/)
  assert.match(source, /transactionFilter\?\.realizedIncomeOnly[\s\S]*posted income transaction/)
  assert.doesNotMatch(source, /realized transactions[^\n]+posted and pending/)
})

test('scoped account views disclose unmapped bank activity and offer an all-activity path', () => {
  assert.match(source, /unmappedActuals\.length > 0/)
  assert.match(source, /not linked to a unique Brevity account/)
  assert.match(source, /Account-linkage status:/)
  assert.match(source, /across all available history/)
  assert.match(source, /Open all bank activity/)
  assert.match(source, /view === 'transactions' && unmappedActuals\.length > 0/)
  assert.match(source, /setSelectedAccts\(null\)[\s\S]*openFilteredTransactions\(\)/)
})

test('phone KPI cards reserve separate space for captions and trends', () => {
  assert.match(source, /min-height: 178px/)
  assert.match(source, /padding: 16px 16px 54px/)
  assert.match(source, /\.kpi-trend \{ left: 16px[^}]+font-size: 11px/s)
})

test('every finance drilldown starts unfiltered and discloses any later subtotal', () => {
  assert.match(source, /const openFilteredTransactions = \(filter = null\) => \{\s*setTransactionListOptions\(\{ \.\.\.DEFAULT_TRANSACTION_LIST_OPTIONS \}\)/)
  assert.match(source, /const openScheduledTransactions = \(filter = null\) => \{\s*setTransactionListOptions\(\{ \.\.\.DEFAULT_TRANSACTION_LIST_OPTIONS \}\)/)
  assert.match(source, /budget lines shown[^\n]+shown of[^\n]+card total/)
})

test('financial calendar reconciliation excludes transfers and names non-income credits', () => {
  assert.match(source, /const actualActivity = summarizeActualCashActivity\(dayActs\)/)
  assert.match(source, /refunds or other credits/)
  assert.match(source, /Transfers are excluded\./)
  assert.doesNotMatch(source, /dayActs\.filter\(tx => tx\.amount < 0\)/)
})

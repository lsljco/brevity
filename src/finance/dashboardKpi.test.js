import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')

test('dashboard income and expense cards use matching timeframe drill-downs', () => {
  assert.match(source, /dashboardIncome = showActuals \? actualRangeTotals\.income : expectedRangeTotals\.income/)
  assert.match(source, /dashboardExpense = showActuals \? actualRangeTotals\.expenses : recurringRangeTotals\.expenses/)
  assert.match(source, /openFilteredTransactions\(\{ direction:'income', label:'Realized income' \}\)/)
  assert.match(source, /openScheduledTransactions\(\{ direction:'income', label:'Expected income' \}\)/)
  assert.match(source, /openFilteredTransactions\(\{ direction:'expense', label:'Actual expenses' \}\)/)
  assert.match(source, /openScheduledTransactions\(\{ direction:'expense', recurringOnly:true, label:'Recurring expenses' \}\)/)
})

test('dashboard cash flow and 90-day floor drill into their own supporting records', () => {
  assert.match(source, /dashboardCashFlow = showActuals \? actualRangeTotals\.net : expectedRangeTotals\.net/)
  assert.match(source, /openScheduledTransactions\(\{ label:'Expected cash flow' \}\)/)
  assert.match(source, /if \(minDay\) setSelDay\(toISO\(minDay\)\); setView\('calendar'\)/)
})

test('scheduled timeframe drill-downs display occurrence totals instead of one base amount', () => {
  assert.match(source, /rangeAmount: calculateTransactionAmountForRange|const rangeAmount = calculateTransactionAmountForRange/)
  assert.match(source, /fmtMoney\(tx\.rangeAmount \?\? tx\.amount\)/)
  assert.match(source, /occurrence.*in timeframe/)
})

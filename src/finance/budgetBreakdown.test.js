import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBudgetBreakdown, budgetBreakdownTotal } from './budgetBreakdown.js'

test('budget breakdown lines total the selected month card including repeated occurrences', () => {
  const lines = buildBudgetBreakdown({
    month: new Date(2026, 8, 1),
    direction: 'income',
    transactions: [
      { id:'weekly', name:'Weekly income', type:'income', freq:'weekly', start:'2026-09-04', amount:500 },
      { id:'monthly', name:'Monthly income', type:'income', freq:'monthly', start:'2026-09-15', amount:1000 },
      { id:'expense', name:'Expense', type:'expense', freq:'monthly', start:'2026-09-01', amount:200 },
    ],
  })

  assert.deepEqual(lines.map(line => [line.name, line.amount]), [['Weekly income', 2000], ['Monthly income', 1000]])
  assert.ok(lines.every(line => line.date === '2026-09-01'))
  assert.equal(budgetBreakdownTotal(lines), 3000)
})

test('budget breakdown uses a selected-month plan override once per named line', () => {
  const lines = buildBudgetBreakdown({
    month: new Date(2026, 8, 1),
    direction: 'expense',
    budget: { Utilities: [0,0,0,0,0,0,0,0,450] },
    transactions: [
      { id:'one', name:'Utilities', cat:'Utilities', type:'expense', freq:'weekly', start:'2026-09-01', amount:100 },
      { id:'two', name:'Utilities', cat:'Utilities', type:'expense', freq:'monthly', start:'2026-09-02', amount:50 },
    ],
  })

  assert.equal(lines.length, 1)
  assert.equal(lines[0].amount, 450)
  assert.equal(budgetBreakdownTotal(lines), 450)
})

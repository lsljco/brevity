import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileFinanceDay } from './reconciliation.js'

test('matches a posted merchant to the expected occurrence and shows the amount variance', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'phones', name:'AT&T Cell Phones', type:'expense', freq:'monthly', start:'2026-08-11', amount:400, cat:'Utilities' }],
    actuals:[{ id:'posted', merchant_name:'AT&T Cell Phones', name:'AT&T Payment', date:'2026-09-11', amount:450, category:'RENT_AND_UTILITIES' }],
  })
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].state, 'amount-variance')
  assert.equal(result.rows[0].amountVariance, 50)
  assert.equal(result.varianceTotal, 50)
})

test('shows timing variance when the amount matches on a nearby date', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'netflix', name:'Netflix', type:'expense', freq:'monthly', start:'2026-08-11', amount:25, cat:'Subscriptions' }],
    actuals:[{ id:'posted', name:'Netflix', date:'2026-09-13', amount:25, category:'Subscriptions' }],
  })
  assert.equal(result.rows[0].state, 'timing-variance')
  assert.equal(result.rows[0].timingVariance, 2)
})

test('separates missing expected, unplanned actual, and transfers', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'mortgage', name:'Mortgage', type:'expense', freq:'monthly', start:'2026-08-11', amount:2000, cat:'Housing' }],
    actuals:[
      { id:'coffee', name:'Coffee Shop', date:'2026-09-11', amount:8, category:'FOOD_AND_DRINK' },
      { id:'transfer', name:'Transfer to savings', date:'2026-09-11', amount:500, category:'TRANSFER_OUT' },
    ],
  })
  assert.deepEqual(result.rows.map(row => row.state).sort(), ['missing-actual', 'unplanned-actual'])
})

test('does not force a match when two actuals are equally plausible', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'phone', name:'AT&T', type:'expense', freq:'monthly', start:'2026-08-11', amount:100, cat:'Utilities' }],
    actuals:[
      { id:'a', name:'AT&T', date:'2026-09-11', amount:100, category:'Utilities' },
      { id:'b', name:'AT&T', date:'2026-09-11', amount:101, category:'Utilities' },
    ],
  })
  assert.equal(result.rows[0].state, 'ambiguous')
  assert.equal(result.rows[0].candidates.length, 2)
})

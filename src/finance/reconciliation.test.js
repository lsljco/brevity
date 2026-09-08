import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reconcileFinanceDay, reconciliationDrilldownTarget } from './reconciliation.js'

const reconciliationView = readFileSync(new URL('./FinanceReconciliation.jsx', import.meta.url), 'utf8')

test('reconciliation UI distinguishes matched differences from unresolved activity', () => {
  assert.doesNotMatch(reconciliationView, />net amount variance</)
  assert.match(reconciliationView, />matched net cash difference</)
  assert.match(reconciliationView, />expected, not found</)
  assert.match(reconciliationView, />unplanned bank activity</)
  assert.match(reconciliationView, /Excluded from totals until reviewed/)
  assert.match(reconciliationView, /posted and pending bank activity/)
  assert.doesNotMatch(reconciliationView, /plausible posted matches|unplanned posted transactions/)
  assert.match(reconciliationView, /Show all .* reconciliation items/)
})

test('matches a posted merchant to the expected occurrence and shows the amount variance', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'phones', name:'AT&T Cell Phones', type:'expense', freq:'monthly', start:'2026-08-11', amount:400, cat:'Utilities' }],
    actuals:[{ id:'posted', merchant_name:'AT&T Cell Phones', name:'AT&T Payment', date:'2026-09-11', amount:450, category:'RENT_AND_UTILITIES' }],
  })
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].state, 'amount-variance')
  assert.equal(result.rows[0].amountVariance, 50)
  assert.deepEqual(result.matchedDifference, { income:0, expense:50, netCash:-50, count:1 })
  assert.deepEqual(result.expectedNotPosted, { income:0, expense:0, total:0, count:0 })
  assert.deepEqual(result.unplannedPosted, { income:0, expense:0, total:0, count:0 })
})

test('matched income and expense differences report their directions and truthful net cash effect', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[
      { id:'pay', name:'Payroll', type:'income', freq:'once', start:'2026-09-11', amount:400, cat:'Income' },
      { id:'phone', name:'AT&T', type:'expense', freq:'once', start:'2026-09-11', amount:400, cat:'Utilities' },
    ],
    actuals:[
      { id:'pay-posted', name:'Payroll', date:'2026-09-11', amount:-500, category:'INCOME' },
      { id:'phone-posted', name:'AT&T', date:'2026-09-11', amount:450, category:'UTILITIES' },
    ],
  })

  assert.deepEqual(result.matchedDifference, { income:100, expense:50, netCash:50, count:2 })
})

test('reconciliation drilldowns isolate the reviewed occurrence instead of inheriting the global timeframe', () => {
  assert.deepEqual(reconciliationDrilldownTarget({ expected:{ id:'phone', occurrenceDate:'2026-09-11' } }), {
    type:'scheduled',
    filter:{ ids:['phone'], range:{ preset:'custom', from:'2026-09-11', to:'2026-09-11' } },
  })
  assert.deepEqual(reconciliationDrilldownTarget({ actual:{ id:'posted', date:'2026-09-13' } }), {
    type:'actual',
    filter:{ ids:['posted'], dateFrom:'2026-09-13', dateTo:'2026-09-13' },
  })
  assert.deepEqual(reconciliationDrilldownTarget({ candidates:[
    { id:'later', date:'2026-09-14' },
    { id:'earlier', date:'2026-09-10' },
  ] }), {
    type:'actual',
    filter:{ ids:['later','earlier'], dateFrom:'2026-09-10', dateTo:'2026-09-14' },
  })
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
  assert.deepEqual(result.matchedDifference, { income:0, expense:0, netCash:0, count:0 })
  assert.deepEqual(result.expectedNotPosted, { income:0, expense:2000, total:2000, count:1 })
  assert.deepEqual(result.unplannedPosted, { income:0, expense:8, total:8, count:1 })
  assert.equal(result.unresolvedExposureTotal, 2008)
})

test('reports unresolved income and expense exposure by direction instead of hiding it behind zero matched variance', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[
      { id:'payroll', name:'Payroll', type:'income', freq:'weekly', start:'2026-09-04', amount:1200, cat:'Income' },
      { id:'phones', name:'Cell phones', type:'expense', freq:'monthly', start:'2026-08-11', amount:400, cat:'Utilities' },
    ],
    actuals:[
      { id:'refund', name:'Merchant refund', date:'2026-09-11', amount:-25, category:'GENERAL_MERCHANDISE' },
      { id:'coffee', name:'Coffee Shop', date:'2026-09-11', amount:8, category:'FOOD_AND_DRINK' },
    ],
  })

  assert.deepEqual(result.matchedDifference, { income:0, expense:0, netCash:0, count:0 })
  assert.deepEqual(result.expectedNotPosted, { income:1200, expense:400, total:1600, count:2 })
  assert.deepEqual(result.unplannedPosted, { income:0, expense:8, otherInflows:25, total:33, count:2 })
  assert.equal(result.unresolvedExposureTotal, 1633)
  assert.equal(result.allClear, false)
})

test('refunds cannot satisfy expected income while pending payroll is a not-yet-realized match', () => {
  const refundOnly = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'payroll', name:'Payroll', type:'income', freq:'once', start:'2026-09-11', amount:500, cat:'Income' }],
    actuals:[{ id:'refund', name:'Payroll purchase refund', date:'2026-09-11', amount:-500, category:'GENERAL_MERCHANDISE' }],
  })
  assert.deepEqual(refundOnly.rows.map(row => row.state).sort(), ['missing-actual', 'unplanned-actual'])
  assert.equal(refundOnly.rows.find(row => row.actual)?.actualKind, 'other-inflow')
  assert.deepEqual(refundOnly.unplannedPosted, { income:0, expense:0, otherInflows:500, total:500, count:1 })

  const pendingPayroll = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'payroll', name:'Employer Payroll', type:'income', freq:'once', start:'2026-09-11', amount:500, cat:'Income' }],
    actuals:[{ id:'pending-payroll', name:'Employer Payroll', date:'2026-09-11', amount:-500, category:'INCOME', pending:true }],
  })
  assert.equal(pendingPayroll.rows.length, 1)
  assert.equal(pendingPayroll.rows[0].state, 'pending-match')
  assert.equal(pendingPayroll.rows[0].realizationStatus, 'pending')
  assert.equal(pendingPayroll.allClear, false)
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

test('does not arbitrarily apply one bank item to two equally plausible plans', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[
      { id:'phone-one', name:'AT&T', type:'expense', freq:'once', start:'2026-09-11', amount:100, cat:'Utilities' },
      { id:'phone-two', name:'AT&T', type:'expense', freq:'once', start:'2026-09-11', amount:100, cat:'Utilities' },
    ],
    actuals:[
      { id:'bank-charge', name:'AT&T', date:'2026-09-11', amount:100, category:'Utilities' },
    ],
  })

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].state, 'ambiguous')
  assert.equal(result.rows[0].actual.id, 'bank-charge')
  assert.deepEqual(result.rows[0].expectedCandidates.map(transaction => transaction.id), ['phone-one','phone-two'])
  assert.equal(result.counts['missing-actual'] || 0, 0)
  assert.equal(result.counts['unplanned-actual'] || 0, 0)
})

test('secures a strong exact match before a generic plan forms an ambiguity group', () => {
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[
      { id:'specific-phone', name:'AT&T Mobility 607', type:'expense', freq:'once', start:'2026-09-11', amount:100, cat:'Utilities' },
      { id:'generic-phone', name:'AT&T', type:'expense', freq:'once', start:'2026-09-11', amount:100, cat:'Utilities' },
    ],
    actuals:[
      { id:'specific-bank-charge', name:'AT&T Mobility 607', date:'2026-09-11', amount:100, category:'Utilities' },
      { id:'generic-bank-charge', name:'AT&T Store', date:'2026-09-11', amount:100, category:'Utilities' },
    ],
  })

  assert.equal(result.rows.length, 2)
  assert.equal(result.rows.every(row => row.state === 'matched'), true)
  assert.equal(result.rows.find(row => row.expected.id === 'specific-phone').actual.id, 'specific-bank-charge')
  assert.equal(result.rows.find(row => row.expected.id === 'generic-phone').actual.id, 'generic-bank-charge')
  assert.equal(result.counts.ambiguous || 0, 0)
  assert.equal(result.counts['missing-actual'] || 0, 0)
  assert.equal(result.counts['unplanned-actual'] || 0, 0)
})

test('retains every plausible bank candidate in an ambiguous reconciliation row and drilldown', () => {
  const actuals = Array.from({ length:5 }, (_, index) => ({
    id:`candidate-${index + 1}`,
    name:'AT&T',
    date:'2026-09-11',
    amount:100 + (index % 3),
    category:'Utilities',
  }))
  const result = reconcileFinanceDay({
    date:'2026-09-11',
    scheduled:[{ id:'phone', name:'AT&T', type:'expense', freq:'once', start:'2026-09-11', amount:100, cat:'Utilities' }],
    actuals,
  })

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].state, 'ambiguous')
  assert.deepEqual(result.rows[0].candidates.map(transaction => transaction.id), actuals.map(transaction => transaction.id))
  assert.deepEqual(
    reconciliationDrilldownTarget(result.rows[0]).filter.ids,
    actuals.map(transaction => transaction.id),
  )
})

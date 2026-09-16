import test from 'node:test'
import assert from 'node:assert/strict'
import { clearPillarAnalyses, collectPillarContextFromStorage, generatePillarAnalysis, PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisContextSignature, pillarAnalysisStorageKey, readPillarAnalysis } from './pillarAnalysisApi.js'

function storage(initial = {}) {
  const values = { ...initial }
  return {
    get length() { return Object.keys(values).length },
    key: index => Object.keys(values)[index] ?? null,
    getItem: key => values[key] ?? null,
    setItem: (key, value) => { values[key] = String(value) },
    removeItem: key => { delete values[key] },
    values,
  }
}

test('finance analysis reads the active finance, Plaid and budget storage keys', () => {
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9: JSON.stringify({ accounts:[{ id:'a1', balance:1250 }], transactions:[{ id:'scheduled', name:'JS Old Castle Iincome', type:'income', amount:100, freq:'once', start:'2026-09-08', cat:'Housing' }] }),
    plaid_actuals_cache: JSON.stringify([{ id:'posted', date:'2026-09-08', name:'Posted purchase', amount:42 }]),
    lslj_budget_v1: JSON.stringify({ Groceries:[300] }),
    plaid_synced_at: '2026-08-20T22:00:00.000Z',
  }), '2026-09-08')
  assert.equal(context.accounts[0].balance, 1250)
  assert.equal(context.scheduledTransactions[0].id, 'scheduled')
  assert.equal(context.scheduledTransactions[0].name, 'JS CRH Oldcastle Income')
  assert.equal(context.scheduledTransactions[0].cat, 'Income')
  assert.equal(context.actualTransactions[0].id, 'posted')
  assert.deepEqual(context.budgets.Groceries, [300])
  assert.equal(context.syncedAt, undefined)
})

test('finance analysis summary separates posted month-to-date activity, the scheduled month baseline, pending activity, and review exposure', () => {
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9:JSON.stringify({
      accounts:[
        { id:'a1', name:'Operating Account', balance:5000 },
        { id:'a2', name:'Savings', balance:2000 },
      ],
      transactions:[
        { id:'pay', name:'Payroll', type:'income', amount:5000, freq:'monthly', start:'2026-09-01', cat:'Income', acct:'a1' },
        { id:'rent', name:'Rent', type:'expense', amount:2000, freq:'monthly', start:'2026-09-02', cat:'Housing', acct:'a1' },
        { id:'grocery', name:'Groceries', type:'expense', amount:125, freq:'weekly', start:'2026-09-08', cat:'Food', acct:'a1' },
        { id:'savings', name:'Savings transfer', type:'transfer', amount:500, freq:'monthly', start:'2026-09-08', acct:'a1', transferTo:'a2' },
      ],
    }),
    plaid_actuals_cache:JSON.stringify([
      { id:'pay-posted', date:'2026-09-01', amount:-5000, name:'Payroll', category:'INCOME', pending:false, accountId:'a1' },
      { id:'rent-posted', date:'2026-09-02', amount:2000, name:'Rent', category:'RENT', pending:false, accountId:'a1' },
      { id:'refund', date:'2026-09-03', amount:-100, name:'Purchase refund', category:'GENERAL_MERCHANDISE', pending:false, accountId:'a1' },
      { id:'coffee', date:'2026-09-08', amount:12, name:'Coffee', category:'FOOD_AND_DRINK', pending:false, accountId:'a1' },
      { id:'pending-card', date:'2026-09-08', amount:75, name:'Card hold', category:'GENERAL_MERCHANDISE', pending:true, accountId:'a1' },
      { id:'bank-transfer', date:'2026-09-08', amount:300, name:'Transfer', category:'TRANSFER_OUT', pending:false, accountId:'a1' },
      { id:'future', date:'2026-09-10', amount:999, name:'Future charge', category:'SHOPPING', pending:false, accountId:'a1' },
    ]),
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-09-09T12:00:00Z'}),
  }), '2026-09-08')

  assert.deepEqual(context.analysisSummary.actualMonthToDate, {
    income:5000,
    otherInflows:100,
    expenses:2012,
    net:3088,
    transactionCount:4,
  })
  assert.deepEqual(context.analysisSummary.scheduledMonthBaseline, {
    income:5000, expenses:2500, net:2500, scheduledLineCount:3, occurrenceCount:6,
  })
  assert.deepEqual(context.analysisSummary.pending, { count:1, inflowAmount:0, expenseAmount:75, grossAmount:75, net:-75 })
  assert.equal(context.analysisSummary.asOfDate,'2026-09-08')
  assert.equal(context.analysisSummary.accountCount,2)
  assert.deepEqual(context.analysisSummary.largestPostedExpense, {
    id:'rent-posted', name:'Rent', amount:2000, date:'2026-09-02', category:'RENT', accountId:'a1',
  })
  assert.deepEqual(context.analysisSummary.largestScheduledExpenseLine, {
    id:'rent', name:'Rent', monthlyAmount:2000, perOccurrenceAmount:2000,
    occurrenceCount:1, firstOccurrenceDate:'2026-09-02', category:'Housing', accountId:'a1',
  })
  assert.equal(context.analysisSummary.reconciliation.needsReviewCount,3)
  assert.deepEqual(context.analysisSummary.reconciliation.reviewAmounts, {
    knownGrossTotal:212, ambiguousGroupCount:0, complete:true,
  })
  assert.equal(context.analysisSummary.reconciliation.unresolvedExposureTotal,212)
  assert.equal(context.analysisSummary.reconciliation.counts['missing-actual'],1)
  assert.equal(context.analysisSummary.reconciliation.counts['unplanned-actual'],2)
  assert.deepEqual(context.analysisSummary.reconciliation.largestUnresolved, {
    state:'missing-actual', label:'Groceries', amount:125, expectedIds:['grocery'], actualIds:[], date:'2026-09-08',
  })
})

test('finance summary is calculated from all corrected records before raw prompt rows are bounded', () => {
  const recent = Array.from({ length:250 }, (_, index) => ({
    id:`recent-${String(index).padStart(3, '0')}`,
    date:'2026-09-08',
    amount:1,
    name:`Small expense ${index}`,
    category:'SHOPPING',
    pending:false,
  }))
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9:JSON.stringify({ accounts:[], transactions:[] }),
    plaid_actuals_cache:JSON.stringify([
      { id:'early-largest', date:'2026-09-01', amount:900, name:'Annual fee', category:'BANK_FEES', pending:false },
      ...recent,
      { id:'after-cutoff', date:'2026-09-09', amount:5000, name:'Tomorrow', category:'SHOPPING', pending:false },
    ]),
  }), '2026-09-08')

  assert.equal(context.actualTransactions.length,250)
  assert.equal(context.actualTransactions.some(transaction => transaction.id === 'early-largest'),false)
  assert.equal(context.actualTransactions.some(transaction => transaction.id === 'after-cutoff'),false)
  assert.equal(context.analysisSummary.actualMonthToDate.expenses,1150)
  assert.equal(context.analysisSummary.actualMonthToDate.transactionCount,251)
  assert.equal(context.analysisSummary.largestPostedExpense.id,'early-largest')
  assert.equal(context.analysisSummary.largestPostedExpense.amount,900)
})

test('finance analysis summary has a stable, honest empty state for malformed or absent sources', () => {
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9:'null',
    plaid_actuals_cache:'{broken',
    lslj_budget_v1:'null',
    lslj_tx_overrides_v1:'null',
  }), '2026-09-08')

  assert.deepEqual(context.analysisSummary.actualMonthToDate, {
    income:0, otherInflows:0, expenses:0, net:0, transactionCount:0,
  })
  assert.deepEqual(context.analysisSummary.scheduledMonthBaseline, {
    income:0, expenses:0, net:0, scheduledLineCount:0, occurrenceCount:0,
  })
  assert.deepEqual(context.analysisSummary.pending, { count:0, inflowAmount:0, expenseAmount:0, grossAmount:0, net:0 })
  assert.equal(context.analysisSummary.sourceCoverage.transactionCache,'unavailable')
  assert.equal(context.analysisSummary.reconciliation.needsReviewCount,0)
  assert.equal(context.analysisSummary.reconciliation.unresolvedExposureTotal,0)
  assert.equal('largestUnresolved' in context.analysisSummary.reconciliation,false)
  assert.equal('largestPostedExpense' in context.analysisSummary,false)
  assert.equal('largestScheduledExpenseLine' in context.analysisSummary,false)
})

test('finance insights ignore obsolete manual balance overrides', () => {
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9:JSON.stringify({ accounts:[{ id:'operating', balance:1200 }], transactions:[] }),
    lslj_bal_overrides_v1:JSON.stringify({ '2026-09-07':999999 }),
  }))
  assert.equal(context.accounts[0].balance,1200)
  assert.equal('balanceOverrides' in context,false)
  assert.equal(JSON.stringify(context).includes('999999'),false)
})

test('Finance distinguishes an unavailable transaction source from a fresh empty snapshot', () => {
  const plan={
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[{id:'mortgage',name:'Primary Mortgage',type:'expense',amount:2000,freq:'once',start:'2026-09-08'}]}),
  }
  const unavailable=collectPillarContextFromStorage('finance',storage(plan),'2026-09-08')
  assert.equal(unavailable.analysisSummary.sourceCoverage.transactionCache,'unavailable')
  assert.equal(unavailable.analysisSummary.sourceCoverage.reconciliation,'unavailable')
  assert.equal(unavailable.analysisSummary.reconciliation.needsReviewCount,0)

  const fresh=collectPillarContextFromStorage('finance',storage({
    ...plan,
    plaid_actuals_cache:'[]',
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-09-09T12:00:00Z'}),
  }),'2026-09-08')
  assert.equal(fresh.analysisSummary.sourceCoverage.reconciliation,'available')
  assert.equal(fresh.analysisSummary.reconciliation.counts['missing-actual'],1)
  assert.deepEqual(fresh.analysisSummary.reconciliation.reviewAmounts,{knownGrossTotal:2000,ambiguousGroupCount:0,complete:true})
})

test('Finance preserves the correct largest scheduled name when scheduled records have no IDs', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[
      {name:'Small charge',type:'expense',amount:10,freq:'once',start:'2026-09-01'},
      {name:'Large charge',type:'expense',amount:100,freq:'once',start:'2026-09-02'},
    ]}),
    plaid_actuals_cache:'[]',
  }),'2026-09-08')
  assert.deepEqual(context.analysisSummary.largestScheduledExpenseLine,{
    name:'Large charge',monthlyAmount:100,perOccurrenceAmount:100,occurrenceCount:1,firstOccurrenceDate:'2026-09-02',
  })
})

test('Finance analysis ignores structural edits hidden inside transaction metadata overrides', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[]}),
    plaid_actuals_cache:JSON.stringify([{id:'bank-row',date:'2026-09-08',name:'Original',amount:10,category:'SHOPPING',pending:false}]),
    lslj_tx_overrides_v1:JSON.stringify({'bank-row':{name:'Renamed',category:'Utilities',amount:-999,date:'2026-01-01',pending:true,accountId:'other'}}),
  }),'2026-09-08')
  assert.deepEqual(context.actualTransactions[0],{
    id:'bank-row',date:'2026-09-08',name:'Renamed',amount:10,category:'Utilities',pending:false,
  })
  assert.equal(context.analysisSummary.actualMonthToDate.expenses,10)
  assert.equal(context.analysisSummary.actualMonthToDate.income,0)
})

test('Finance pending summary keeps inflow and expense direction separate', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[]}),
    plaid_actuals_cache:JSON.stringify([
      {id:'pending-in',date:'2026-09-08',name:'Pending deposit',amount:-100,pending:true,category:'INCOME'},
      {id:'pending-out',date:'2026-09-08',name:'Pending purchase',amount:40,pending:true,category:'SHOPPING'},
    ]),
  }),'2026-09-08')
  assert.deepEqual(context.analysisSummary.pending,{count:2,inflowAmount:100,expenseAmount:40,grossAmount:140,net:60})
})

test('Finance reconciliation never calls a same-day or not-yet-covered scheduled item missing', () => {
  const plan=JSON.stringify({accounts:[],transactions:[
    {id:'bill',name:'Bill',type:'expense',amount:100,freq:'once',start:'2026-09-08'},
    {id:'future-bill',name:'Future bill',type:'expense',amount:200,freq:'once',start:'2026-09-10'},
  ]})
  const sameDay=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:plan,
    plaid_actuals_cache:'[]',
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-09-08T12:00:00Z'}),
  }),'2026-09-08')
  assert.equal(sameDay.analysisSummary.sourceCoverage.reconciliation,'limited')
  assert.equal(sameDay.analysisSummary.sourceCoverage.reconciliationReason,'same-day-missing-conclusions-withheld')
  assert.equal(sameDay.analysisSummary.reconciliation.counts['missing-actual'],0)
  assert.equal(sameDay.analysisSummary.reconciliation.needsReviewCount,0)

  const future=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:plan,
    plaid_actuals_cache:'[]',
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-09-08T12:00:00Z'}),
  }),'2026-09-10')
  assert.equal(future.analysisSummary.sourceCoverage.reconciliation,'unavailable')
  assert.equal(future.analysisSummary.sourceCoverage.reconciliationReason,'date-after-source-coverage')
  assert.equal(future.analysisSummary.reconciliation.counts['missing-actual'],0)
})

test('Finance reconciliation uses later covered postings without moving them into as-of totals', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[
      {id:'rent',name:'Rent',type:'expense',amount:2000,freq:'once',start:'2026-09-08'},
    ]}),
    plaid_actuals_cache:JSON.stringify([
      {id:'rent-posted',date:'2026-09-09',name:'Rent',amount:2000,pending:false,category:'RENT'},
    ]),
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-09-10T12:00:00Z'}),
  }),'2026-09-08')

  assert.equal(context.analysisSummary.actualMonthToDate.transactionCount,0)
  assert.equal(context.analysisSummary.actualMonthToDate.expenses,0)
  assert.equal(context.analysisSummary.reconciliation.counts['missing-actual'],0)
  assert.equal(context.analysisSummary.reconciliation.counts['timing-variance'],1)
  assert.equal(context.analysisSummary.reconciliation.needsReviewCount,1)
  assert.deepEqual(context.analysisSummary.reconciliation.largestUnresolved,{
    state:'timing-variance',label:'Rent',amount:2000,expectedIds:['rent'],actualIds:['rent-posted'],date:'2026-09-09',
  })
})

test('Finance rejects a nominally fresh marker that does not cover the analysis date', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[
      {id:'bill',name:'Bill',type:'expense',amount:100,freq:'once',start:'2026-09-08'},
    ]}),
    plaid_actuals_cache:'[]',
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-01-01T12:00:00Z'}),
  }),'2026-09-08')
  assert.equal(context.analysisSummary.sourceCoverage.checkedDate,'2026-01-01')
  assert.equal(context.analysisSummary.sourceCoverage.reconciliation,'unavailable')
  assert.equal(context.analysisSummary.sourceCoverage.reconciliationReason,'date-after-source-coverage')
  assert.equal(context.analysisSummary.reconciliation.needsReviewCount,0)
})

test('Finance scheduled month counts real occurrences and labels the largest monthly line total', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[
      {id:'weekly',name:'Weekly bill',type:'expense',amount:100,freq:'weekly',start:'2026-09-01'},
      {id:'once',name:'One-time bill',type:'expense',amount:300,freq:'once',start:'2026-09-20'},
    ]}),
    plaid_actuals_cache:'[]',
  }),'2026-09-08')
  assert.deepEqual(context.analysisSummary.scheduledMonthBaseline,{
    income:0,expenses:800,net:-800,scheduledLineCount:2,occurrenceCount:6,
  })
  assert.deepEqual(context.analysisSummary.largestScheduledExpenseLine,{
    id:'weekly',name:'Weekly bill',monthlyAmount:500,perOccurrenceAmount:100,
    occurrenceCount:5,firstOccurrenceDate:'2026-09-01',
  })
})

test('Finance reconciliation uses collision-safe internal identities without exposing them', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[
      {name:'Utility',type:'expense',amount:100,cat:'Utilities',freq:'once',start:'2026-09-08'},
      {name:'Utility',type:'expense',amount:150,cat:'Utilities',freq:'once',start:'2026-09-08'},
    ]}),
    plaid_actuals_cache:JSON.stringify([{id:'posted',name:'Utility',date:'2026-09-08',amount:100,category:'Utilities',pending:false}]),
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-09-09T12:00:00Z'}),
  }),'2026-09-08')
  assert.equal(context.analysisSummary.reconciliation.exactMatchCount,1)
  assert.equal(context.analysisSummary.reconciliation.counts['missing-actual'],1)
  assert.equal(context.analysisSummary.reconciliation.needsReviewCount,1)
  assert.equal(JSON.stringify(context).includes('__pillar_analysis_'),false)
})

test('Finance reconciliation does not present an ambiguous candidate maximum as a total', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[
      {id:'one',name:'Utility',type:'expense',amount:100,cat:'Utilities',freq:'once',start:'2026-09-08'},
      {id:'two',name:'Utility',type:'expense',amount:150,cat:'Utilities',freq:'once',start:'2026-09-08'},
    ]}),
    plaid_actuals_cache:JSON.stringify([{id:'posted',name:'Utility',date:'2026-09-08',amount:125,category:'Utilities',pending:false}]),
    brevity_plaid_transaction_freshness_v1:JSON.stringify({status:'fresh',checkedAt:'2026-09-09T12:00:00Z'}),
  }),'2026-09-08')
  assert.deepEqual(context.analysisSummary.reconciliation.reviewAmounts,{
    knownGrossTotal:0,ambiguousGroupCount:1,complete:false,
  })
  assert.equal(context.analysisSummary.reconciliation.largestUnresolved.state,'ambiguous')
  assert.equal('amount' in context.analysisSummary.reconciliation.largestUnresolved,false)
})

test('Finance raw support rows stay inside the selected month', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[],transactions:[
      {id:'september',name:'September bill',type:'expense',amount:100,freq:'once',start:'2026-09-05'},
      {id:'october',name:'October bill',type:'expense',amount:200,freq:'once',start:'2026-10-01'},
    ]}),
    plaid_actuals_cache:JSON.stringify([
      {id:'august',name:'August fee',date:'2026-08-31',amount:10,pending:false},
      {id:'september-posted',name:'September fee',date:'2026-09-02',amount:20,pending:false},
      {id:'tomorrow',name:'Tomorrow fee',date:'2026-09-09',amount:30,pending:false},
    ]),
  }),'2026-09-08')
  assert.deepEqual(context.actualTransactions.map(transaction=>transaction.id),['september-posted'])
  assert.deepEqual(context.scheduledTransactions.map(transaction=>transaction.id),['september'])
})

test('household analysis includes authoritative calendar, maintenance, inventory, and schedule context', () => {
  const context = collectPillarContextFromStorage('household', storage({
    family_calendar_events_v1: JSON.stringify([
      { id:'meeting-1', source:'finance-meeting', title:'Jabin will meet Tara', owner:'Tarrica', participants:['Jabin'] },
    ]),
    brevity_icloud_calendar_cache_v1:JSON.stringify({ calendar:'Family', refreshedAt:'2026-09-07T12:00:00Z', events:[{ id:'apple-1', source:'icloud', title:'Tara family reunion', owner:'Tara' }] }),
    brevity_household_maintenance_v1:JSON.stringify({ trackingStartedOn:'2026-09-01', occurrences:{ 'task-1':{ complete:true, updatedAt:'2026-09-07T12:00:00Z' } } }),
    brevity_household_inventory_v1:JSON.stringify({ items:[{ id:'milk', name:'Milk', quantity:1, parLevel:2, updatedAt:'2026-09-07T12:00:00Z' }], waste:[] }),
    brevity_household_schedule_v1:JSON.stringify({ blocks:[
      { id:'school', title:'School', date:'2026-09-07', startTime:'09:00' },
      { id:'canceled', title:'Canceled appointment', date:'2026-09-07', startTime:'10:00', canceled:true },
    ], routines:[], routineOverrides:{} }),
  }), '2026-09-07')
  assert.equal(context.calendar.brevityEvents[0].title,'Javin will meet Terica')
  assert.equal(context.calendar.brevityEvents[0].owner,'Terica')
  assert.deepEqual(context.calendar.brevityEvents[0].participants,['Javin'])
  assert.equal(context.calendar.appleFamilyCalendar[0].title,'Tara family reunion')
  assert.equal(context.calendar.appleFamilyCalendar[0].owner,'Tara')
  assert.equal(context.maintenance.occurrences['task-1'].complete,true)
  assert.equal(context.inventory.items[0].name,'Milk')
  assert.equal(context.schedule.blocks[0].title,'School')
  assert.equal(context.analysisSummary.asOfDate,'2026-09-07')
  assert.equal(context.analysisSummary.inventory.lowStock,1)
  assert.equal(context.analysisSummary.schedule.blocksToday,1)
  assert.equal(context.analysisSummary.lowStockItems[0].name,'Milk')
  assert.equal(context.analysisSummary.todaySchedule[0].title,'School')
  assert.equal(context.analysisSummary.todaySchedule.some(item=>item.title==='Canceled appointment'),false)
})

test('household analysis summary reports date-scoped operational exceptions without treating plans as completed', () => {
  const context = collectPillarContextFromStorage('household', storage({
    homehq_items_v1:JSON.stringify([
      { id:'late', title:'Late project', status:'Active', due:'2026-09-07', raci:{ responsible:['Nyla'] } },
      { id:'today', title:'Due project', status:'In Progress', due:'2026-09-08' },
      { id:'done', title:'Finished project', status:'Done', due:'2026-09-01' },
    ]),
    family_calendar_events_v1:JSON.stringify([{ id:'local', source:'project', title:'Inspection', date:'2026-09-08' }]),
    brevity_icloud_calendar_cache_v1:JSON.stringify({ events:[{ id:'apple', source:'icloud', title:'School', date:'2026-09-08' }] }),
    brevity_household_maintenance_v1:JSON.stringify({
      trackingStartedOn:'2026-09-07',
      occurrences:{
        '2026-09-07:monday-nyla-upstairs':{ complete:true, submittedAt:'2026-09-07T20:00:00Z', approvedAt:'2026-09-07T21:00:00Z' },
        '2026-09-08:tuesday-nyla-main-floor':{ complete:true, submittedAt:'2026-09-08T20:00:00Z' },
      },
    }),
    brevity_household_inventory_v1:JSON.stringify({
      items:[
        { id:'milk', name:'Milk', quantity:1, parLevel:2, expiresOn:'2026-09-09' },
        { id:'old', name:'Old food', quantity:1, parLevel:0, expiresOn:'2026-09-01' },
      ],
      waste:[{ id:'waste', recordedAt:'2026-09-08T12:00:00Z', estimatedValue:4 }],
    }),
    brevity_household_schedule_v1:JSON.stringify({
      blocks:[{ id:'school', title:'School', date:'2026-09-08', attendance:{ Nyla:'pending' } }],
      routines:[{ id:'reset', title:'Reset', days:[2], enabled:true }],
      routineOverrides:{},
    }),
  }), '2026-09-08')

  assert.equal(context.projects[0].due,'2026-09-01')
  assert.deepEqual(context.analysisSummary.projects, { open:2, dueToday:1, overdue:1 })
  assert.equal(context.analysisSummary.commitmentsToday,1)
  assert.deepEqual(context.analysisSummary.todayCalendarEvents.map(item=>item.title),['Inspection'])
  assert.deepEqual(context.analysisSummary.maintenance, {
    dueToday:2, approved:1, awaitingSignoff:1, overdue:1, exceptions:0,
  })
  assert.deepEqual(context.analysisSummary.inventory, {
    lowStock:1, expiringSoon:1, expired:1, monthlyWaste:4,
  })
  assert.deepEqual(context.analysisSummary.schedule, {
    blocksToday:1, routinesToday:1, pendingInvitations:1,
  })
  assert.equal(context.analysisSummary.attentionProjects[0].title,'Late project')
  assert.equal(context.analysisSummary.maintenanceAttention[0].title,'Upstairs floors + stairs')
  assert.equal(context.analysisSummary.expiringItems[0].name,'Old food')
})

test('schedule-sensitive pillars receive only their own selected-date commitments', () => {
  const records=storage({
    brevity_household_schedule_v1:JSON.stringify({
      blocks:[
        {id:'spiritual-today',title:'Family devotion',date:'2026-09-08',startTime:'06:30',pillar:'Spiritual Maturity'},
        {id:'health-today',title:'Nutritionist appointment',date:'2026-09-08',startTime:'10:00',pillar:'Health & Nutrition'},
        {id:'fitness-today',title:'Strength session',date:'2026-09-08',startTime:'07:00',pillar:'Physical Fitness'},
        {id:'finance-today',title:'Budget review',date:'2026-09-08',startTime:'17:00',pillar:'Finance'},
        {id:'health-tomorrow',title:'Meal prep',date:'2026-09-09',startTime:'18:00',pillar:'health'},
        {id:'cancelled-education',title:'Cancelled tutoring',date:'2026-09-08',pillar:'education',cancelled:true},
      ],
      routines:[],
      routineOverrides:{},
    }),
    family_calendar_events_v1:JSON.stringify([
      {id:'education-today',title:'Math tutoring',date:'2026-09-08',time:'14:00',pillar:'education'},
      {id:'ministry-today',title:'Fellowship visit',date:'2026-09-08',time:'19:00',pillar:'Ministry & Fellowship'},
      {id:'ministry-tomorrow',title:'Leadership meeting',date:'2026-09-09',time:'09:00',pillar:'ministry'},
      {id:'cancelled-spiritual',title:'Cancelled prayer',date:'2026-09-08',time:'08:00',pillar:'spiritual',status:'cancelled'},
    ]),
    brevity_icloud_calendar_cache_v1:JSON.stringify({
      error:'Apple Calendar is unavailable.',errorStatus:503,lastSuccessfulSyncAt:'2026-09-08T10:00:00Z',
      events:[
        {id:'apple-spiritual',source:'icloud',title:'Prayer call',date:'2026-09-08',time:'07:00',pillar:'spiritual'},
        {id:'apple-finance',source:'icloud',title:'Advisor call',date:'2026-09-08',time:'16:00',pillar:'finance'},
        {id:'apple-finance-cancelled',source:'icloud',title:'Cancelled bank call',date:'2026-09-08',time:'15:00',pillar:'finance',status:'canceled'},
      ],
    }),
  })

  const spiritual=collectPillarContextFromStorage('spiritual',records,'2026-09-08')
  const health=collectPillarContextFromStorage('health',records,'2026-09-08')
  const fitness=collectPillarContextFromStorage('fitness',records,'2026-09-08')
  const education=collectPillarContextFromStorage('education',records,'2026-09-08')
  const finance=collectPillarContextFromStorage('finance',records,'2026-09-08')
  const ministry=collectPillarContextFromStorage('ministry',records,'2026-09-08')

  assert.deepEqual(spiritual.scheduleItems.map(item=>item.title),['Family devotion'])
  assert.deepEqual(spiritual.calendarEvents,[])
  assert.deepEqual(health.scheduleItems.map(item=>item.title),['Nutritionist appointment'])
  assert.deepEqual(fitness.scheduleItems.map(item=>item.title),['Strength session'])
  assert.deepEqual(education.scheduleItems,[])
  assert.deepEqual(education.calendarEvents.map(item=>item.title),['Math tutoring'])
  assert.deepEqual(finance.scheduleItems.map(item=>item.title),['Budget review'])
  assert.deepEqual(finance.calendarEvents,[])
  assert.deepEqual(ministry.calendarEvents.map(item=>item.title),['Fellowship visit'])
  assert.equal(spiritual.appleCalendarCoverage.state,'unconfigured')
  assert.equal(spiritual.appleCalendarCoverage.usable,true)
  assert.equal(spiritual.appleCalendarCoverage.error,'Apple Calendar is unavailable.')
  assert.deepEqual(finance.appleCalendarCoverage,spiritual.appleCalendarCoverage)
})

test('current Apple calendar events remain available to their matching pillar', () => {
  const records=storage({
    brevity_icloud_calendar_cache_v1:JSON.stringify({
      lastSuccessfulSyncAt:new Date().toISOString(),
      events:[{id:'apple-spiritual',source:'icloud',title:'Prayer call',date:'2026-09-08',time:'07:00',pillar:'spiritual'}],
    }),
  })
  const spiritual=collectPillarContextFromStorage('spiritual',records,'2026-09-08')
  assert.equal(spiritual.appleCalendarCoverage.stale,false)
  assert.deepEqual(spiritual.calendarEvents.map(item=>item.title),['Prayer call'])
})

test('clearing a changed daily plan invalidates every pillar analysis for that date', () => {
  const targetFinance=pillarAnalysisStorageKey('2026-08-21','finance','Larry')
  const targetSpiritual=pillarAnalysisStorageKey('2026-08-21','spiritual','Lorenzo')
  const otherDate=pillarAnalysisStorageKey('2026-08-22','finance','Larry')
  const cache=storage({[targetFinance]:'{}',[targetSpiritual]:'{}',[otherDate]:'{}'})
  clearPillarAnalyses('2026-08-21',cache)
  assert.equal(cache.getItem(targetFinance),null)
  assert.equal(cache.getItem(targetSpiritual),null)
  assert.equal(cache.getItem(otherDate),'{}')
})

test('pillar analysis browser cache is schema, context, and signed-member scoped', () => {
  const date = '2026-09-06'
  const pillar = 'spiritual'
  const key = pillarAnalysisStorageKey(date, pillar, 'Larry')
  assert.match(key, new RegExp(`_v${PILLAR_ANALYSIS_SCHEMA_VERSION}_`))
  assert.notEqual(key,pillarAnalysisStorageKey(date,pillar,'Lorenzo'))
  assert.equal(readPillarAnalysis(date, pillar, 'Larry', storage({ [key]: JSON.stringify({ schemaVersion:1, member:'Larry', analysis:{} }) })), null)
  const current = { schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION, member:'Larry', analysis:{ headline:'Growth' } }
  const cache=storage({[key]:JSON.stringify(current),[pillarAnalysisStorageKey(date,pillar,'Lorenzo')]:JSON.stringify({...current,member:'Lorenzo'})})
  assert.deepEqual(readPillarAnalysis(date,pillar,'Larry',cache),{...current,cached:true})
  assert.equal(readPillarAnalysis(date,pillar,'Terica',cache),null)
  assert.equal(readPillarAnalysis(date,pillar,'Larry',storage({[key]:JSON.stringify({...current,member:'Lorenzo'})})),null)
  assert.equal(readPillarAnalysis(date,pillar,'Larry',storage({[key]:JSON.stringify({...current,quality:{status:'evidence-fallback'}})})),null)
})

test('pillar analysis cache invalidates when a relevant source value changes', () => {
  const date='2026-09-07'
  const pillar='finance'
  const key=pillarAnalysisStorageKey(date,pillar,'Larry')
  const original=pillarAnalysisContextSignature({pillarData:{headline:'Preserve liquidity'},localContext:{actualTransactions:[{id:'one',amount:40}]}})
  const sameDataDifferentKeyOrder=pillarAnalysisContextSignature({localContext:{actualTransactions:[{amount:40,id:'one'}]},pillarData:{headline:'Preserve liquidity'}})
  const changed=pillarAnalysisContextSignature({pillarData:{headline:'Preserve liquidity'},localContext:{actualTransactions:[{id:'one',amount:45}]}})
  const cached={schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION,member:'Larry',contextSignature:original,analysis:{headline:'Source-aware'}}

  assert.equal(original,sameDataDifferentKeyOrder)
  assert.notEqual(original,changed)
  assert.deepEqual(readPillarAnalysis(date,pillar,'Larry',storage({[key]:JSON.stringify(cached)}),original),{...cached,cached:true})
  assert.equal(readPillarAnalysis(date,pillar,'Larry',storage({[key]:JSON.stringify(cached)}),changed),null)
})

test('household context signature invalidates for each authoritative operational source', () => {
  const base={
    family_calendar_events_v1:JSON.stringify([{id:'local',title:'Family dinner',date:'2026-09-07'}]),
    brevity_icloud_calendar_cache_v1:JSON.stringify({events:[{id:'apple',title:'School',date:'2026-09-07'}]}),
    brevity_household_maintenance_v1:JSON.stringify({occurrences:{task:{complete:false}}}),
    brevity_household_inventory_v1:JSON.stringify({items:[{id:'milk',name:'Milk',quantity:1}]}),
    brevity_household_schedule_v1:JSON.stringify({blocks:[{id:'block',title:'Study',date:'2026-09-07'}]}),
  }
  const signature=records=>pillarAnalysisContextSignature({localContext:collectPillarContextFromStorage('household',storage(records))})
  const original=signature(base)
  const changes=[
    {...base,brevity_icloud_calendar_cache_v1:JSON.stringify({events:[{id:'apple',title:'Practice',date:'2026-09-07'}]})},
    {...base,brevity_household_maintenance_v1:JSON.stringify({occurrences:{task:{complete:true}}})},
    {...base,brevity_household_inventory_v1:JSON.stringify({items:[{id:'milk',name:'Milk',quantity:0}]})},
    {...base,brevity_household_schedule_v1:JSON.stringify({blocks:[{id:'block',title:'Study',date:'2026-09-08'}]})},
  ]
  changes.forEach(changed=>assert.notEqual(signature(changed),original))
})

test('finance context applies future rules and explicit actual overrides without copying bulky source records', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[{id:'operating',name:'Operating Account',plaidAccountId:'bank'}],transactions:[]}),
    plaid_actuals_cache:JSON.stringify([
      {id:'tx1',date:'2026-09-07',amount:450,name:'AT&T PAYMENT',category:'GENERAL_MERCHANDISE',accountId:'bank',logoData:'x'.repeat(1000)},
      {id:'deleted',date:'2026-09-07',amount:900,name:'Deleted transaction',category:'SHOPPING',accountId:'bank'},
    ]),
    lslj_tx_rules_v1:JSON.stringify([{id:'rule1',applyToExisting:true,conditions:{merchantName:{on:true,match:'contains',value:'AT&T'}},actions:{renameMerchant:{on:true,value:'AT&T Mobility'},updateCategory:{on:true,value:'Phone'}}}]),
    lslj_tx_overrides_v1:JSON.stringify({tx1:{name:'AT&T Wireless',category:'Utilities'},deleted:{_deleted:true}}),
  }),'2026-09-07')
  assert.equal(context.actualTransactions[0].name,'AT&T Wireless')
  assert.equal(context.actualTransactions[0].category,'Utilities')
  assert.equal(context.actualTransactions[0].logoData,undefined)
  assert.equal(context.actualTransactionCount,1)
  assert.equal(context.sourceActualTransactionCount,2)
  assert.equal(context.analysisSummary.actualMonthToDate.expenses,450)
  assert.equal(context.analysisSummary.largestPostedExpense.name,'AT&T Wireless')
  assert.equal(context.analysisSummary.largestPostedExpense.category,'Utilities')
  assert.equal(context.transactionRules[0].id,'rule1')
  assert.equal(context.transactionOverrides.some(override => override.id === 'tx1'),true)
})

test('context signatures preserve authored array order while ignoring freshness-only timestamps', () => {
  const first=pillarAnalysisContextSignature({pillarData:{formationSteps:['Read','Reflect','Respond']},localContext:{syncedAt:'2026-09-07T10:00:00Z'}})
  const second=pillarAnalysisContextSignature({pillarData:{formationSteps:['Read','Reflect','Respond']},localContext:{syncedAt:'2026-09-07T11:00:00Z'}})
  assert.equal(first,second)
  assert.notEqual(first,pillarAnalysisContextSignature({pillarData:{formationSteps:['Respond','Reflect','Read']},localContext:{syncedAt:'2026-09-07T12:00:00Z'}}))

  const calendarBase={state:'ready',usable:true,stale:false}
  const calendarFirst=pillarAnalysisContextSignature({localContext:{appleCalendarCoverage:{...calendarBase,lastSuccessfulSyncAt:'2026-09-07T10:00:00Z',message:'Calendar verified 10:00 AM.'}}})
  const calendarSecond=pillarAnalysisContextSignature({localContext:{appleCalendarCoverage:{...calendarBase,lastSuccessfulSyncAt:'2026-09-07T10:15:00Z',message:'Calendar verified 10:15 AM.'}}})
  assert.equal(calendarFirst,calendarSecond,'an identical successful calendar refresh must retain the analysis cache')
  assert.notEqual(calendarFirst,pillarAnalysisContextSignature({localContext:{appleCalendarCoverage:{...calendarBase,stale:true,state:'stale',lastSuccessfulSyncAt:'2026-09-07T10:15:00Z',message:'Calendar is stale.'}}}))
})

test('set-like finance records remain stable because their collector canonicalizes source order', () => {
  const common={
    lslj_finance_v9:JSON.stringify({accounts:[{id:'operating',name:'Operating Account'}],transactions:[]}),
  }
  const first=collectPillarContextFromStorage('finance',storage({...common,plaid_actuals_cache:JSON.stringify([{id:'b',date:'2026-09-06',amount:2},{id:'a',date:'2026-09-07',amount:1}])}))
  const second=collectPillarContextFromStorage('finance',storage({...common,plaid_actuals_cache:JSON.stringify([{id:'a',date:'2026-09-07',amount:1},{id:'b',date:'2026-09-06',amount:2}])}))
  assert.equal(pillarAnalysisContextSignature({localContext:first}),pillarAnalysisContextSignature({localContext:second}))
})

test('only the latest A/B request may persist or publish a pillar analysis', async () => {
  const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
  const requests={A:deferred(),B:deferred()}
  const cache=storage()
  const events=[]
  const plan={version:1,finance:{headline:'Preserve liquidity'}}
  const responseFor=(marker,headline)=>({ok:true,status:200,json:async()=>({schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION,member:'Larry',pillar:'finance',date:'2026-09-07',contextSignature:pillarAnalysisContextSignature({pillarData:plan.finance,localContext:{marker}}),analysis:{headline}})})
  const fetcher=(_url,options)=>requests[JSON.parse(options.body).localContext.marker].promise
  const common={pillar:'finance',date:'2026-09-07',plan,currentMember:'Larry',fetcher,storage:cache,eventTarget:{dispatchEvent:event=>events.push(event)}}
  const requestA=generatePillarAnalysis({...common,localContext:{marker:'A'}})
  const requestB=generatePillarAnalysis({...common,localContext:{marker:'B'}})
  requests.B.resolve(responseFor('B','Newest'))
  const resultB=await requestB
  requests.A.resolve(responseFor('A','Stale'))
  const resultA=await requestA
  assert.equal(resultB.analysis.headline,'Newest')
  assert.equal(resultA,null)
  assert.equal(JSON.parse(cache.getItem(pillarAnalysisStorageKey('2026-09-07','finance','Larry'))).analysis.headline,'Newest')
  assert.equal(events.length,1)
})

test('the browser timeout covers a stalled analysis response body',async()=>{
  const plan={version:1,finance:{headline:'Preserve liquidity'}}
  const fetcher=async(_url,{signal})=>({
    ok:true,
    status:200,
    json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true})),
  })
  await assert.rejects(generatePillarAnalysis({
    pillar:'finance',date:'2026-09-07',plan,currentMember:'Larry',localContext:{},fetcher,
    storage:storage(),eventTarget:{dispatchEvent:()=>{}},timeoutMs:5,
  }),/analysis timed out/i)
})

test('a valid analysis remains usable when browser persistence is unavailable',async()=>{
  const plan={version:1,finance:{headline:'Preserve liquidity'}}
  const localContext={marker:'storage-unavailable'}
  const body={
    schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION,
    member:'Larry',pillar:'finance',date:'2026-09-07',
    contextSignature:pillarAnalysisContextSignature({pillarData:plan.finance,localContext}),
    analysis:{headline:'Use the verified posted-cash position.'},
  }
  const result=await generatePillarAnalysis({
    pillar:'finance',date:'2026-09-07',plan,currentMember:'Larry',localContext,
    fetcher:async()=>({ok:true,status:200,json:async()=>body}),
    storage:{setItem(){throw Object.assign(new Error('storage blocked'),{name:'SecurityError'})}},
    eventTarget:{dispatchEvent(){throw new Error('event target unavailable')}},
  })
  assert.equal(result,body)
})

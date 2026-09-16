import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCanonicalFinanceModel } from './financeDomain.js'
import { buildMeetingCashScope, classifyMeetingScheduledTransaction, meetingBalanceQualification, meetingCoverageTone, meetingTransactionQualification } from './financeMeetingTruth.js'

test('Finance Meetings uses only exactly linked checking and savings cash',()=>{
  const scope=buildMeetingCashScope({
    balanceDataStatus:'fresh',
    accounts:[
      {id:'checking',name:'Operating',type:'checking',balance:900,plaidAccountId:'p-check',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,plaidAvailableBalance:900},
      {id:'savings',name:'Reserve',type:'savings',balance:2000,plaidAccountId:'p-save',plaidType:'depository',plaidSubtype:'savings',plaidCurrentBalance:2100,plaidAvailableBalance:2000},
      {id:'card',name:'Credit Card',type:'credit',balance:-300,plaidAccountId:'p-card'},
      {id:'invest',name:'Brokerage',type:'investment',balance:5000,plaidAccountId:'p-invest'},
    ],
    scheduled:[
      {id:'pay',type:'income',acct:'checking'},
      {id:'interest',type:'income',acct:'savings'},
      {id:'card-charge',type:'expense',acct:'card'},
      {id:'investment-buy',type:'expense',acct:'invest'},
    ],
    actuals:[
      {id:'checking-posted',accountId:'p-check'},
      {id:'savings-posted',accountId:'p-save'},
      {id:'credit-posted',accountId:'p-card'},
      {id:'unlinked-posted',accountId:'p-unknown'},
    ],
  })

  assert.deepEqual(scope.accounts.map(account=>account.id),['checking','savings'])
  assert.deepEqual(scope.excludedAccounts.map(account=>account.id),['card','invest'])
  assert.deepEqual(scope.scheduled.map(transaction=>transaction.id),['pay','interest'])
  assert.deepEqual(scope.actuals.map(transaction=>transaction.id),['checking-posted','savings-posted'])
  assert.equal(scope.excludedActualCount,2)
  assert.equal(scope.availableCash,2900)
  assert.equal(scope.currentBalance,3100)
  assert.equal(scope.hasDistinctCurrentBalance,true)
  assert.equal(scope.balanceDataStatus,'fresh')
})

test('meeting cash truth collapses duplicate balances and downgrades an unanchored fresh claim',()=>{
  const noDistinctAvailable=buildMeetingCashScope({
    balanceDataStatus:'fresh',
    accounts:[{id:'checking',type:'checking',balance:1000,plaidAccountId:'p-check',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000}],
  })
  assert.equal(noDistinctAvailable.availableCash,1000)
  assert.equal(noDistinctAvailable.currentBalance,null)
  assert.equal(noDistinctAvailable.hasDistinctCurrentBalance,false)
  assert.equal(noDistinctAvailable.balanceDataStatus,'fresh')

  const unanchored=buildMeetingCashScope({balanceDataStatus:'fresh',accounts:[{id:'checking',type:'checking',balance:1000}]})
  assert.equal(unanchored.balanceDataStatus,'unverified')
  assert.equal(unanchored.hasVerifiedCashAnchors,false)

  const duplicateSourceId=buildMeetingCashScope({
    balanceDataStatus:'fresh',
    accounts:[
      {id:'checking',type:'checking',balance:1000,plaidAccountId:'duplicate',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000},
      {id:'card',type:'credit',balance:-100,plaidAccountId:'duplicate'},
    ],
    actuals:[{id:'ambiguous-posted',accountId:'duplicate'}],
  })
  assert.equal(duplicateSourceId.balanceDataStatus,'unverified')
  assert.deepEqual(duplicateSourceId.actuals,[])
})

test('cash coverage cannot render green from cached, stale, partial, or unverified balances',()=>{
  for(const balanceDataStatus of ['cached','stale','partial','unverified','unknown']){
    assert.equal(meetingCoverageTone({availableCash:10000,expectedInflows:1000,obligations:100,balanceDataStatus}),'yellow')
  }
  assert.equal(meetingCoverageTone({availableCash:10000,expectedInflows:1000,obligations:100,balanceDataStatus:'fresh'}),'green')
  assert.equal(meetingCoverageTone({availableCash:50,expectedInflows:0,obligations:100,balanceDataStatus:'stale'}),'red')
})

test('meeting source qualifications explicitly distinguish stored actuals from projections',()=>{
  assert.match(meetingBalanceQualification('cached'),/Cached balance snapshot.*no live bank balance/i)
  assert.match(meetingBalanceQualification('partial'),/Partial balance refresh.*stored values/i)
  assert.match(meetingTransactionQualification('stale'),/Stale bank activity.*last retained posted transaction snapshot/i)
  assert.match(meetingTransactionQualification('unverified'),/freshness is not verified/i)
})

test('Finance Meetings counts boundary transfers but keeps cash-to-cash transfers neutral',()=>{
  const scheduled=[
    {id:'pay',name:'Paycheck',type:'income',amount:200,acct:'checking',freq:'once',start:'2026-09-08'},
    {id:'groceries',name:'Groceries',type:'expense',amount:50,acct:'checking',freq:'once',start:'2026-09-08'},
    {id:'card-payment',name:'Card payment',type:'transfer',amount:300,acct:'checking',transferTo:'card',freq:'once',start:'2026-09-08'},
    {id:'cash-return',name:'Cash return',type:'transfer',amount:125,acct:'card',transferTo:'checking',freq:'once',start:'2026-09-08'},
    {id:'reserve-move',name:'Reserve move',type:'transfer',amount:500,acct:'checking',transferTo:'savings',freq:'once',start:'2026-09-08'},
  ]
  const accounts=[
    {id:'checking',name:'Operating',type:'checking',balance:1000,plaidAccountId:'p-check'},
    {id:'savings',name:'Reserve',type:'savings',balance:500,plaidAccountId:'p-save'},
    {id:'card',name:'Card',type:'credit',balance:-300,plaidAccountId:'p-card'},
  ]
  const scope=buildMeetingCashScope({accounts,scheduled,balanceDataStatus:'cached',transactionFreshnessStatus:'fresh'})

  assert.equal(scope.boundaryTransferCount,2)
  assert.equal(scope.internalCashTransferCount,1)
  assert.deepEqual(scope.scheduled.map(transaction=>[transaction.id,transaction.type,transaction.name]),[
    ['pay','income','Paycheck'],
    ['groceries','expense','Groceries'],
    ['card-payment','expense','Transfer out · Card payment'],
    ['cash-return','income','Transfer in · Cash return'],
  ])

  const model=buildCanonicalFinanceModel({accounts:scope.accounts,scheduled:scope.scheduled,cashFlowScheduled:scope.cashFlowScheduled,actuals:scope.actuals,today:new Date(2026,8,8)})
  assert.equal(model.metrics.todayInflows,325)
  assert.equal(model.metrics.todayObligations,350)
  assert.equal(model.metrics.weekInflows,325)
  assert.equal(model.metrics.weekObligations,350)
  assert.equal(model.metrics.projectedMonthlyNet,-25)
  assert.equal(model.metrics.monthForecast,-25)
  assert.deepEqual(model.breakdowns.nearIncome.map(row=>row.label),['Paycheck','Transfer in · Cash return'])
  assert.deepEqual(model.breakdowns.nearExpenses.map(row=>row.label),['Groceries','Transfer out · Card payment'])
})

test('scheduled transfer classification is relative to the selected cash boundary',()=>{
  const cashIds=new Set(['checking','savings'])
  assert.equal(classifyMeetingScheduledTransaction({type:'transfer',acct:'checking',transferTo:'savings'},cashIds).kind,'internal-transfer')
  assert.equal(classifyMeetingScheduledTransaction({type:'transfer',acct:'checking',transferTo:'card'},cashIds).transaction.type,'expense')
  assert.equal(classifyMeetingScheduledTransaction({type:'transfer',acct:'card',transferTo:'savings'},cashIds).transaction.type,'income')
  assert.equal(classifyMeetingScheduledTransaction({type:'transfer',acct:'card',transferTo:'loan'},cashIds),null)
})

test('cash and actual metrics report unavailable when their evidence scope is absent',()=>{
  const noCash=buildMeetingCashScope({
    accounts:[{id:'card',type:'credit',balance:-100,plaidAccountId:'p-card'}],
    scheduled:[{id:'charge',type:'expense',amount:25,acct:'card'}],
    actuals:[{id:'posted',accountId:'p-card'}],
    balanceDataStatus:'fresh',
    transactionFreshnessStatus:'fresh',
  })
  assert.equal(noCash.hasCashAccounts,false)
  assert.equal(noCash.availableCash,null)
  assert.equal(noCash.actualMetricsAvailable,false)
  assert.deepEqual(noCash.scheduled,[])
  assert.deepEqual(noCash.actuals,[])

  const checking={id:'checking',type:'checking',balance:1000,plaidAccountId:'p-check',plaidType:'depository',plaidSubtype:'checking'}
  for(const transactionFreshnessStatus of ['unknown','disconnected','unverified','unmatched','ambiguous','incompatible']){
    const empty=buildMeetingCashScope({accounts:[checking],transactionFreshnessStatus,today:new Date(2026,8,8)})
    assert.equal(empty.actualMetricsAvailable,false,`${transactionFreshnessStatus} must not turn an unverified empty result into $0`)
    assert.match(meetingTransactionQualification(transactionFreshnessStatus,{actualMetricsAvailable:empty.actualMetricsAvailable}),/Actual bank activity unavailable/i)
  }
  assert.equal(buildMeetingCashScope({accounts:[checking],transactionFreshnessStatus:'fresh',today:new Date(2026,8,8)}).actualMetricsAvailable,true)
  assert.equal(buildMeetingCashScope({accounts:[checking],transactionFreshnessStatus:'unknown',actuals:[{id:'retained',accountId:'p-check',date:'2026-09-08',amount:20,category:'Food'}],today:new Date(2026,8,8)}).actualMetricsAvailable,true)
})

test('old, pending, transfer-only, and incompatible rows cannot manufacture an actual $0',()=>{
  const checking={id:'checking',type:'checking',balance:1000,plaidAccountId:'p-check',plaidType:'depository',plaidSubtype:'checking'}
  const today=new Date(2026,8,8)
  const evidenceRows=[
    {id:'old',accountId:'p-check',date:'2026-08-31',amount:20,category:'Food'},
    {id:'pending',accountId:'p-check',date:'2026-09-08',amount:20,pending:true,category:'Food'},
    {id:'transfer',accountId:'p-check',date:'2026-09-08',amount:20,category:'Transfer'},
    {id:'future',accountId:'p-check',date:'2026-09-09',amount:20,category:'Food'},
  ]
  for(const actual of evidenceRows){
    const scope=buildMeetingCashScope({accounts:[checking],actuals:[actual],transactionFreshnessStatus:'unknown',today})
    assert.equal(scope.actualMetricsAvailable,false,`${actual.id} is not current posted non-transfer evidence`)
  }

  const incompatible=buildMeetingCashScope({
    accounts:[{...checking,plaidType:'credit',plaidSubtype:'credit card'}],
    actuals:[{id:'posted',accountId:'p-check',date:'2026-09-08',amount:20,category:'Food'}],
    transactionFreshnessStatus:'fresh',
    today,
  })
  assert.equal(incompatible.hasExactCashTransactionLinks,false)
  assert.deepEqual(incompatible.actuals,[])
  assert.equal(incompatible.actualMetricsAvailable,false)
})

test('coverage never infers a safe result from unavailable cash metrics',()=>{
  assert.equal(meetingCoverageTone({availableCash:null,expectedInflows:100,obligations:50,balanceDataStatus:'fresh'}),'yellow')
  assert.equal(meetingCoverageTone({availableCash:100,expectedInflows:null,obligations:50,balanceDataStatus:'fresh'}),'yellow')
  assert.equal(meetingCoverageTone({availableCash:100,expectedInflows:0,obligations:null,balanceDataStatus:'fresh'}),'yellow')
})

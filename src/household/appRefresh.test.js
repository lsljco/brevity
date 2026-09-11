import assert from 'node:assert/strict'
import test from 'node:test'
import { applicationRefreshDate, buildBankRefreshState, buildRefreshIssues, shouldRequestBankUpdate } from './appRefresh.js'

test('application refresh requests the authoritative household date across UTC boundaries', () => {
  assert.equal(applicationRefreshDate(new Date('2026-09-07T02:30:00.000Z')), '2026-09-06')
  assert.equal(applicationRefreshDate(new Date('2026-09-07T04:30:00.000Z')), '2026-09-07')
})

test('the first administrator refresh after app open requests a live Plaid update', () => {
  assert.equal(shouldRequestBankUpdate({ automaticAlreadyRequested:false, financeReadOnly:false }), true)
  assert.equal(shouldRequestBankUpdate({ automaticAlreadyRequested:true, financeReadOnly:false }), false)
  assert.equal(shouldRequestBankUpdate({ requestBankUpdate:true, automaticAlreadyRequested:true, financeReadOnly:false }), true)
  assert.equal(shouldRequestBankUpdate({ requestBankUpdate:true, automaticAlreadyRequested:false, financeReadOnly:true }), false)
})

test('bank refresh state never reports fresh while Plaid is still processing or data is stale', () => {
  const processing=buildBankRefreshState({
    balanceDataStatus:'fresh',
    transactionFreshness:{status:'partial',lastFullSuccessAt:'2026-09-10T12:00:00.000Z'},
    transactionRefresh:{requested:true,stillProcessing:true},
    errors:[],
  },{requested:true})
  assert.equal(processing.status,'processing')

  const stale=buildBankRefreshState({
    balanceDataStatus:'fresh',
    transactionFreshness:{status:'stale',lastFullSuccessAt:'2026-09-10T12:00:00.000Z'},
    transactionRefresh:{requested:true,stillProcessing:false},
    errors:[],
  },{requested:true})
  assert.equal(stale.status,'stale')

  const fresh=buildBankRefreshState({
    balanceDataStatus:'fresh',
    transactionFreshness:{status:'fresh',lastFullSuccessAt:'2026-09-11T01:00:00.000Z'},
    transactionRefresh:{requested:true,stillProcessing:false},
    errors:[],
  },{requested:true})
  assert.equal(fresh.status,'fresh')
})

test('refresh issues identify their source and remain separate from daily decisions', () => {
  const issues=buildRefreshIssues({
    financeResult:{status:'fulfilled',value:{errors:['Pinnacle: login required']}},
    planResult:{status:'fulfilled',value:{}},
    calendar:{error:'Apple Calendar credentials need attention.'},
  })

  assert.deepEqual(issues.map(issue=>issue.source),['Finance & Plaid','Family Calendar'])
  assert.match(issues[0].message,/Pinnacle/)
  assert.match(issues[1].action,/Family Calendar/)
})

test('an incomplete requested bank refresh cannot be hidden behind an all-clear app refresh', () => {
  const bankRefresh={requested:true,status:'stale',lastSuccessfulAt:'2026-09-10T12:00:00.000Z'}
  const issues=buildRefreshIssues({
    financeResult:{status:'fulfilled',value:{errors:[]}},
    planResult:{status:'fulfilled',value:{}},
    calendar:{events:[]},
    bankRefresh,
  })
  assert.equal(issues.length,1)
  assert.equal(issues[0].source,'Finance & Plaid')
  assert.match(issues[0].message,/did not fully complete/i)
  assert.match(issues[0].message,/Last successful transaction sync/i)
})

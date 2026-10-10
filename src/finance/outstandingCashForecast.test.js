import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOutstandingCashForecast } from './outstandingCashForecast.js'
import { today0, toISO, addDays } from './projection.js'
const today = toISO(today0())
const date = days => toISO(addDays(today0(), days))
const account = { id:'cash', type:'checking', balance:3225, plaidCurrentBalance:4600, plaidAccountId:'bank', plaidType:'depository', plaidSubtype:'checking' }
const hoa = { id:'hoa', name:'HOA Dues', acct:'cash', amount:1375, type:'expense', freq:'once', start:today }
const actual = { id:'a', name:'HOA Dues', amount:1375, accountId:'bank', date:today, pending:false }
const forecast = (plans=[hoa], bank=[], accounts=[account]) => buildOutstandingCashForecast(accounts, plans, bank, { days:10, pastDays:20 })
test('HOA remains outstanding: current 4600, projected 3225, propagated tomorrow', () => {
  const result = forecast()
  assert.equal(result.get(today).currentBalance,4600)
  assert.equal(result.get(today).bal,3225)
  assert.equal(result.get(date(1)).bal,3225)
})
test('posted HOA already reflected in current balance is not deducted again', () => {
  assert.equal(forecast([hoa],[actual]).get(today).bal,4600)
})
test('pending HOA is applied once against current, not available balance', () => {
  const result=forecast([hoa],[{...actual,pending:true}]).get(today)
  assert.equal(result.pendingDelta,-1375)
  assert.equal(result.remainingDelta,0)
  assert.equal(result.bal,3225)
})
test('superseded pending ID and duplicate bank rows cannot subtract twice', () => {
  const posted={...actual,id:'posted',pendingTransactionId:'a'}
  assert.equal(forecast([hoa],[{...actual,pending:true},posted,posted]).get(today).bal,4600)
})
test('income adds only while not posted, pending income counted once', () => {
  const plan={...hoa,id:'pay',name:'Payroll',type:'income',amount:800}
  const bank={...actual,name:'Payroll',amount:-800}
  assert.equal(forecast([plan]).get(today).bal,5400)
  assert.equal(forecast([plan],[bank]).get(today).bal,4600)
  assert.equal(forecast([plan],[{...bank,pending:true}]).get(today).bal,5400)
})
test('same amount alone or wrong account never means cleared', () => {
  assert.equal(forecast([hoa],[{...actual,name:'Different vendor'}]).get(today).bal,3225)
  assert.equal(forecast([hoa],[{...actual,accountId:'other'}]).get(today).bal,3225)
})
test('early posting realizes the future occurrence without subtracting again', () => {
  assert.equal(forecast([{...hoa,start:date(2)}],[actual]).get(date(2)).bal,4600)
})
test('one bank ID cannot realize two ambiguous scheduled items', () => {
  const result=forecast([hoa,{...hoa,id:'other'}],[actual]).get(today)
  assert.equal(result.bal,1850)
  assert.equal(result.unmatchedCount,2)
})
test('weekly recurrence matches exact date without consuming next week', () => {
  const result=forecast([{...hoa,freq:'weekly'}],[actual])
  assert.equal(result.get(today).bal,4600)
  assert.equal(result.get(date(7)).bal,3225)
})
test('old pending activity carries forward, unresolved scheduled items carry forward', () => {
  assert.equal(forecast([{...hoa,start:date(-3)}],[{...actual,date:date(-3),pending:true}]).get(today).bal,3225)
  assert.equal(forecast([{...hoa,start:date(-3)}],[]).get(today).bal,3225)
})
test('unlinked balance is qualified and pending holds are not deducted again', () => {
  const point=forecast([hoa],[{...actual,pending:true}],[{...account,plaidCurrentBalance:undefined}]).get(today)
  assert.equal(point.bal,3225)
  assert.equal(point.ledgerComplete,false)
  assert.equal(point.pendingExcluded,1)
})
test('transfers count the remaining in-scope leg only', () => {
  const destination={...account,id:'save',type:'savings',plaidSubtype:'savings',plaidAccountId:'savings',balance:1000,plaidCurrentBalance:1000}
  const plan={...hoa,type:'transfer',transferTo:'save',name:'Savings transfer',amount:200}
  const out={...actual,name:plan.name,amount:200}
  assert.equal(forecast([plan],[],[account,destination]).get(today).bal,5600)
  assert.equal(forecast([plan],[out],[account,destination]).get(today).bal,5800)
  assert.equal(forecast([plan],[out,{...out,id:'in',amount:-200,accountId:'savings'}],[account,destination]).get(today).bal,5600)
})


test('plan starts at yesterday actual close and includes all scheduled activity', () => {
  const plan=buildOutstandingCashForecast([account],[hoa],[actual],{days:2,pastDays:2,reconcile:false,closingBalances:{[date(-1)]:5000}})
  assert.equal(plan.get(today).openingBalance,5000)
  assert.equal(plan.get(today).openingSource,'verified-close')
  assert.equal(plan.get(today).bal,3625)
  assert.equal(plan.get(date(1)).bal,3625)
})
test('switching to bank reconciliation changes calculation, not just display', () => {
  const options={days:2,pastDays:2,closingBalances:{[date(-1)]:5000}}
  const planned=buildOutstandingCashForecast([account],[hoa],[actual],{...options,reconcile:false})
  const reconciled=buildOutstandingCashForecast([account],[hoa],[actual],{...options,reconcile:true})
  assert.equal(planned.get(today).bal,3625)
  assert.equal(reconciled.get(today).bal,4600)
})
test('unique same-day vendor matches actual amount variance without double deduction', () => {
  const result=forecast([hoa],[{...actual,amount:1380}]).get(today)
  assert.equal(result.bal,4600)
  assert.equal(result.realization[0].statuses[0].actualAmount,1380)
})
test('estimated opening reverses today posted activity, but excludes pending', () => {
  const result=buildOutstandingCashForecast([account],[hoa],[actual,{...actual,id:'hold',pending:true,amount:50}],{days:1,pastDays:2,reconcile:false}).get(today)
  assert.equal(result.openingBalance,5975)
  assert.equal(result.openingSource,'estimated-opening')
  assert.equal(result.bal,4600)
})
test('past pending or paid-today obligations remain in planned carryover once', () => {
  for(const bank of [[actual],[{...actual,pending:true,date:date(-1)}]]) {
    const result=buildOutstandingCashForecast([account],[{...hoa,start:date(-1)}],bank,{days:1,pastDays:2,reconcile:false,closingBalances:{[date(-1)]:5000}}).get(today)
    assert.equal(result.overdueDelta,-1375)
    assert.equal(result.bal,3625)
  }
})
test('canceled/skipped occurrences do not become overdue', () => {
  assert.equal(forecast([{...hoa,start:date(-1),skips:[date(-1)]}]).get(today).overdueDelta,0)
})
test('historical intraday observations remain estimates and respect selected account identity', () => {
  const balanceHistory=[{date:date(-1),capturedAt:'2026-10-08T20:00:00Z',kind:'intraday',balances:{bank:7000}}]
  const point=buildOutstandingCashForecast([account],[hoa],[],{days:1,pastDays:2,reconcile:false,balanceHistory}).get(today)
  assert.equal(point.openingBalance,7000)
  assert.equal(point.openingSource,'estimated-opening')
})

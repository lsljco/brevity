import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOutstandingCashForecast } from './outstandingCashForecast.js'
import { reconcileFinanceDay } from './reconciliation.js'
const date = '2026-10-25'
const account = { id:'cash', type:'checking', balance:2000, plaidCurrentBalance:2000, plaidAccountId:'bank', plaidType:'depository', plaidSubtype:'checking' }
const plan = { id:'phone', name:'Cell Phones', type:'expense', freq:'once', start:date, amount:646.16, acct:'cash', cat:'Subscriptions' }
const bank = { id:'hold', name:'Pending: 10/25/2026 - Memo Debit POS - AT&T MOBILITY EP DALLAS TX0000000646160038232610253 22208', date, amount:646.16, accountId:'bank', pending:true, category:'RENT_AND_UTILITIES' }
const forecast = (plans=[plan], actuals=[bank], accounts=[account]) => buildOutstandingCashForecast(accounts,plans,actuals,{today:date,days:2,pastDays:2}).get(date)
const report = (scheduled=[plan], actuals=[bank]) => reconcileFinanceDay({scheduled,actuals,date,accountMap:{bank:'cash'},exactAmounts:true})
test('AT&T pending charge replaces projected Cell Phones and counts once',()=>{
  const point=forecast()
  assert.equal(point.remainingDelta,0)
  assert.equal(point.bal,1353.84)
  assert.equal(point.realization[0].statuses[0].status,'pending')
  assert.equal(report().rows.length,1)
  assert.equal(report().rows[0].state,'pending-match')
})
test('available balance and posted replacement never deduct the phone bill again',()=>{
  assert.equal(forecast([plan],[bank],[{...account,plaidAvailableBalance:1353.84}]).bal,1353.84)
  const posted={...bank,id:'posted',pending:false,pendingTransactionId:'hold'}
  assert.equal(forecast([plan],[bank,posted]).bal,2000)
  assert.equal(report([plan],[posted]).rows[0].state,'matched')
})
test('descriptor fallback requires exact amount, date, direction, account and compatible vendor IDs',()=>{
  for(const row of [
    {...bank,amount:646.17}, {...bank,date:'2026-10-24'}, {...bank,amount:-646.16},
    {...bank,accountId:'other'}, {...bank,name:'AT&T Internet'},
    {...bank,name:'Different vendor'}
  ]) {
    assert.equal(forecast([plan],[row]).remainingDelta,-646.16)
    assert.equal(report([plan],[row]).rows.some(r=>r.state==='missing-actual'),true)
  }
  assert.equal(forecast([{...plan,vendorId:'a'}],[{...bank,vendorId:'b'}]).remainingDelta,-646.16)
})
test('ambiguous phone charges or plans cannot silently consume a bank charge',()=>{
  assert.equal(forecast([plan],[bank,{...bank,id:'second'}]).remainingDelta,-646.16)
  assert.equal(report([plan],[bank,{...bank,id:'second'}]).rows[0].state,'ambiguous')
  assert.equal(forecast([plan,{...plan,id:'second'}]).remainingDelta,-1292.32)
  assert.equal(report([plan,{...plan,id:'second'}]).rows[0].state,'ambiguous')
})
test('full bill name within a noisy statement is recognized with the same safeguards',()=>{
  const scheduled={...plan,name:'SmartSheet',amount:20.85}
  const charge={...bank,name:'Pending Memo Debit POS SMARTSHEET 12345',amount:20.85}
  assert.equal(forecast([scheduled],[charge]).remainingDelta,0)
  assert.equal(report([scheduled],[charge]).rows[0].state,'pending-match')
})

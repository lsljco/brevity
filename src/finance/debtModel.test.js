import test from 'node:test'
import assert from 'node:assert/strict'
import { debtSummary, matchedDebtPayments, projectDebtPayoff } from './debtModel.js'

const debts=[
  {id:'prosper',creditor:'Prosper',debtType:'Personal loan',status:'Active',originalBalance:45000,currentBalance:39000,interestRate:12,minimumPayment:904.03,paymentMatchText:'PROSPER'},
  {id:'card',creditor:'Card',debtType:'Credit card',status:'Active',originalBalance:5000,currentBalance:3000,interestRate:24,minimumPayment:150,paymentMatchText:'CARD PAYMENT'},
]

test('debt summary uses confirmed balances and entered minimums',()=>{
  assert.deepEqual(debtSummary(debts),{count:2,totalDebt:42000,originalPrincipal:50000,paidDown:8000,monthlyMinimums:1054.03,weightedApr:(39000*12+3000*24)/42000})
})

test('payment matching excludes pending rows and never mutates the confirmed balance',()=>{
  const rows=matchedDebtPayments(debts[0],[{id:'a',name:'PROSPER PAYMENT',amount:904.03,date:'2026-09-01',pending:false},{id:'b',name:'PROSPER PAYMENT',amount:904.03,date:'2026-10-01',pending:true},{id:'c',name:'GROCERY',amount:90,date:'2026-09-02'}])
  assert.deepEqual(rows.map(row=>row.id),['a'])
  assert.equal(debts[0].currentBalance,39000)
})

test('payoff scenario accrues interest and rolls freed minimums into remaining debt capacity',()=>{
  const result=projectDebtPayoff(debts,{monthlyCapacity:10000,reserve:1000})
  assert.ok(result.months>=5&&result.months<=6)
  assert.ok(result.totalInterest>0)
  assert.equal(result.completed.length,2)
  assert.equal(result.available,9000)
})

test('payoff scenario does not invent capacity when obligations consume cash flow',()=>{
  const result=projectDebtPayoff(debts,{monthlyCapacity:1000,reserve:1000})
  assert.equal(result.months,null)
  assert.equal(result.remaining,42000)
})

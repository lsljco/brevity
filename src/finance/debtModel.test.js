import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDebtPayment, debtRuleMatches, debtSummary, matchedDebtPayments, matchingDebtRule, normalizeDebts, projectDebtPayoff } from './debtModel.js'

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

test('reviewed debt payment rules match the selected bank account and statement safely',()=>{
  const ruled=[{...debts[0],paymentRule:{enabled:true,matchText:'TOWER HELOC',matchField:'originalStatement',matchMode:'contains',accountId:'operating',nonPrincipalAmount:0}}]
  const posted={id:'tx-1',name:'Tower payment',originalStatement:'ONLINE PMT TOWER HELOC',amount:2735.02,pending:false}
  assert.equal(debtRuleMatches(ruled[0],posted,'operating'),true)
  assert.equal(debtRuleMatches(ruled[0],posted,'savings'),false)
  assert.equal(matchingDebtRule(ruled,posted,'operating').id,'prosper')
  assert.equal(matchingDebtRule(ruled,{...posted,pending:true},'operating'),null)
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

test('amortized debt payments calculate periodic interest before principal',()=>{
  const result=calculateDebtPayment({...debts[0],interestMethod:'Amortized APR',paymentsPerYear:12},{amount:904.03})
  assert.deepEqual(result,{amount:904.03,interest:390,principal:514.03,nonPrincipalAmount:0,unappliedAmount:0,balanceBefore:39000,balanceAfter:38485.97})
})

test('fixed-interest payments preserve escrow and reduce only calculated principal',()=>{
  const result=calculateDebtPayment({...debts[0],interestMethod:'Fixed interest per payment',fixedInterestAmount:225},{amount:1600},500)
  assert.deepEqual(result,{amount:1600,interest:225,principal:875,nonPrincipalAmount:500,unappliedAmount:0,balanceBefore:39000,balanceAfter:38125})
})

test('payment calculation caps principal at the remaining balance and discloses unapplied money',()=>{
  const result=calculateDebtPayment({id:'small',currentBalance:100,interestMethod:'Principal only'},{amount:150})
  assert.equal(result.principal,100)
  assert.equal(result.balanceAfter,0)
  assert.equal(result.unappliedAmount,50)
})

test('legacy debts receive safe amortization defaults without losing applied payments',()=>{
  const normalized=normalizeDebts([{...debts[0],payments:[{transactionId:'tx-1',amount:904.03,principal:514.03,interest:390,balanceBefore:39000,balanceAfter:38485.97}]}])[0]
  assert.equal(normalized.interestMethod,'Amortized APR')
  assert.equal(normalized.paymentsPerYear,12)
  assert.equal(normalized.payments[0].transactionId,'tx-1')
})

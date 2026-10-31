import test from 'node:test'
import assert from 'node:assert/strict'
import {calculatePayoffProjection} from './scenarioProjection.js'
import {updateIncomeAssumption,calculateScenario} from './scenarioModelingData.js'
const source={notes:['Minimum cash reserve: $100.00','Annual LSTS Income Tax — April: $200.00','Annual Property Tax — October: $300.00','Loan: $1200.00; monthly cashflow released after payoff: $50.00'],schedule:[['2026-10-01','Savings',100,999,''],['2027-12-01','December cashflow',999,999,'']]}
test('income edits recalculate using an explicit take-home ratio and keep source immutable',()=>{
 const row={annualGross:12000,monthlyNet:800,contribution:7}
 const next=updateIncomeAssumption(row,'annualGross',24000)
 assert.equal(next.monthlyNet,1600)
 assert.equal(row.monthlyNet,800)
 assert.equal(calculateScenario({incomes:[next]},500).monthlyCashFlow,1100)
 assert.equal(updateIncomeAssumption({annualGross:0,monthlyNet:null},'annualGross',24000).monthlyNet,null)
 assert.equal(updateIncomeAssumption({...row,annualGross:0,monthlyNet:0},'annualGross',12000,row).monthlyNet,800)
})
test('higher income advances payoff and raises ending cash without cached results',()=>{
 const snapshot=JSON.stringify(source)
 const slow=calculatePayoffProjection(source,200),fast=calculatePayoffProjection(source,500)
 assert.ok(fast.payoff<slow.payoff)
 assert.ok(fast.endingCash>slow.endingCash)
 assert.equal(fast.schedule[0][3],100)
 assert.equal(fast.totalPaid,1700)
 assert.ok(fast.minimumCash>=100)
 const payoffIndex=fast.schedule.findIndex(r=>r[1]==='Loan')
 const paidMonth=fast.schedule[payoffIndex][0]
 assert.equal(fast.schedule.find(r=>r[0]===paidMonth&&r[1]==='Monthly cashflow')[2],500)
 assert.equal(fast.schedule.slice(payoffIndex+1).find(r=>r[1]==='Monthly cashflow')[2],550)
 assert.equal(JSON.stringify(source),snapshot)
})
test('insufficient cash retains unpaid debt and exposes reserve shortfall',()=>{
 const result=calculatePayoffProjection(source,-100)
 assert.equal(result.unpaid,1200)
 assert.equal(result.payoff,'Not within modeled period')
 assert.ok(result.minimumCash<result.reserve)
})
test('incomplete assumptions do not fall back to cached workbook results',()=>{
 assert.ok(calculatePayoffProjection({...source,notes:[]},500).error)
})

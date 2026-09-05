import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCanonicalFinanceModel } from './financeDomain.js'

test('canonical finance model keeps actual and projected monthly truth aligned and excludes transfers',()=>{
  const today=new Date(2026,8,5,12)
  const model=buildCanonicalFinanceModel({
    today,
    accounts:[{id:'a1',name:'Operating Account',available:5000,balance:5200}],
    actuals:[
      {id:'i1',date:'2026-09-01',amount:-2500,category:'INCOME'},
      {id:'e1',date:'2026-09-02',amount:1000,category:'GENERAL_MERCHANDISE'},
      {id:'t1',date:'2026-09-03',amount:500,category:'TRANSFER_OUT'},
    ],
    scheduled:[
      {id:'pi',name:'Income',type:'income',amount:3000,freq:'once',start:'2026-09-10'},
      {id:'pe',name:'Expense',type:'expense',amount:1200,freq:'once',start:'2026-09-12'},
      {id:'pt',name:'Transfer',type:'transfer',amount:900,freq:'once',start:'2026-09-13'},
    ],
    budget:{},
  })
  assert.equal(model.metrics.actualMonthlyIncome,2500)
  assert.equal(model.metrics.actualMonthlyExpenses,1000)
  assert.equal(model.metrics.actualMonthlyNet,1500)
  assert.equal(model.metrics.projectedMonthlyIncome,3000)
  assert.equal(model.metrics.projectedMonthlyExpenses,1200)
  assert.equal(model.metrics.projectedMonthlyNet,1800)
  assert.equal(model.metrics.monthForecast,1800)
})

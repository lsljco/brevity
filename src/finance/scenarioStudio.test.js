import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateIncomeRows,TAX_PROFILE} from './scenarioTax.js'
import {createStudio,newIncome,validateStudio,studioMonthly,projectStudio} from './scenarioStudioModel.js'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
const income=(gross=50000,person='LJ')=>({...newIncome('2026-01-01'),annualGross:gross,person})
const base=()=>({...createStudio({title:'Current',incomes:[{id:'wage',description:'LJ job',annualGross:120000,monthlyNet:8000}]},3000,[],'2026-01-01',9000),projectionMode:'dated',months:12,openingCash:15000,timingConfirmed:true})
test('2026 single GA W-2 calculation matches independent bracket arithmetic',()=>{
 const r=calculateIncomeRows([income()],{LJ:TAX_PROFILE})[0]
 assert.equal(r.taxes.federal,3820) // 1240 + (33900 - 12400) * 12%
 assert.equal(r.taxes.state,1746.5)
 assert.equal(r.taxes.socialSecurity,3100)
 assert.equal(r.taxes.medicare,725)
 assert.equal(r.monthlyNet,3384.04)
})
test('added jobs use combined income and preserve known deposits',()=>{
 const existing={...income(120000),id:'existing',mode:'net',monthlyNet:7000}
 const added=income(50000)
 const rows=calculateIncomeRows([existing,added],{LJ:TAX_PROFILE})
 assert.equal(rows[0].monthlyNet,7000)
 assert.ok(rows[1].taxes.federal>10000)
 assert.ok(rows[1].monthlyNet<calculateIncomeRows([added],{LJ:TAX_PROFILE})[0].monthlyNet)
})
test('same tax unit shares incremental income tax without taxing household members together',()=>{
 const a=income(50000),b=income(50000),separate=income(50000,'NS')
 const together=calculateIncomeRows([a,b],{LJ:TAX_PROFILE})
 const independent=calculateIncomeRows([a,separate],{LJ:TAX_PROFILE,NS:TAX_PROFILE})
 assert.ok(together[0].taxes.federal>independent[0].taxes.federal)
 assert.equal(together[0].taxes.federal,together[1].taxes.federal)
})
test('deductions, explicit credits and dependents alter net; unsupported rules fail closed',()=>{
 const r=income(100000)
 const initial=calculateIncomeRows([r],{LJ:TAX_PROFILE})[0]
 const changed=calculateIncomeRows([{...r,pretax:10000}],{LJ:{...TAX_PROFILE,dependents:1,credits:1000}})[0]
 assert.ok(changed.taxes.federal<initial.taxes.federal)
 assert.ok(changed.taxes.state<initial.taxes.state)
 assert.equal(changed.taxes.socialSecurity,initial.taxes.socialSecurity)
 assert.throws(()=>calculateIncomeRows([r],{LJ:{...TAX_PROFILE,state:'NY'}}),/verified/)
})
test('floor and future bills limit extra settlements; cash never double counts minimums',()=>{
 const a=base();a.liabilities=[{id:'card',name:'Card',balance:10000,apr:0,payment:100,dueDay:1,include:true,method:'Principal only'}]
 a.expenses.push({id:'tax',name:'Tax bill',amount:25000,frequency:'once',start:'2026-04-01',end:'',enabled:true})
 const result=projectStudio(a)
 assert.ok(result.lowest>=9000)
 assert.equal(result.firstShortfall,null)
 const high=projectStudio({...a,cashFloor:20000})
 assert.ok((high.payoffs[0]?.date||'9999')>=(result.payoffs[0]?.date||'9999'))
 assert.ok(result.months.some(m=>m.required===0))
 assert.equal(studioMonthly(a).cashFlow,4900)
})
test('unknown opening cash and unconfirmed schedules cannot spend speculative funds',()=>{
 const a=base();a.liabilities=[{id:'d',name:'Debt',balance:1000,apr:0,payment:0,dueDay:1,include:true,method:'Principal only'}]
 assert.equal(projectStudio({...a,openingCash:null}).endingCash,null)
 assert.equal(projectStudio({...a,openingCash:null}).payoffs.length,0)
 assert.equal(projectStudio({...a,timingConfirmed:false}).payoffs.length,0)
})
test('biweekly income uses dated deposits, end dates and partial first months',()=>{
 const a=base();a.incomes[0]={...a.incomes[0],frequency:'biweekly',start:'2026-01-16',end:'2026-02-01'}
 const r=projectStudio(a)
 assert.equal(r.daily.filter(d=>d.income>0).length,2)
 assert.equal(r.months[1].income,0)
 assert.equal(r.months[0].income,Math.round(8000*12/26*100)/100*2)
})
test('invalid dates, negative amounts, unsupported debt methods and duplicates rejected',()=>{
 const a=base()
 assert.throws(()=>validateStudio({...a,start:'2026-02-30'}),/valid/)
 assert.throws(()=>validateStudio({...a,cashFloor:-1}),/cashFloor/)
 assert.throws(()=>validateStudio({...a,incomes:[a.incomes[0],a.incomes[0]]}),/Duplicate/)
 assert.throws(()=>validateStudio({...a,months:100}),/Horizon/)
})
test('Studio shared save preserves legacy and recovery plans and normalizes server-side',()=>{
 const a=base(),value={scenarios:[{id:'old'}],recoveryPlans:[{id:'recovery'}]}
 a.projectionMode='monthly';a.bonuses=[{id:'bonus',name:'Bonus',amount:2500,date:'2026-12-15',enabled:true}];a.liabilities=[{id:'loan',name:'Loan',balance:4000,apr:0,payment:0,dueDay:1,include:true,method:'Principal only',plannedPayoffDate:'2026-12-20'}]
 const operation={type:'forecast.update',targetId:'studio-test',domain:'finance',description:'Save hypothetical scenario',payload:{studioJson:JSON.stringify({assumptions:a,baseline:a,useAsDefault:true})}}
 assert.doesNotThrow(()=>normalizeActionProposal({operations:[operation]},{member:'Larry',role:'admin'}))
 const {before,after}=applyRecordOperation(value,operation)
 assert.deepEqual(after.studioPlans[0].assumptions.bonuses,a.bonuses);assert.equal(after.studioPlans[0].assumptions.liabilities[0].plannedPayoffDate,'2026-12-20')
 assert.deepEqual(before,value);assert.deepEqual(after.scenarios,value.scenarios);assert.deepEqual(after.recoveryPlans,value.recoveryPlans)
 assert.equal(after.studioDefaultFloor,9000);assert.equal(after.studioDefaultFloorVersion,2);assert.equal(after.studioPlans[0].version,1)
 assert.equal(applyRecordOperation(after,operation).after.studioPlans[0].version,2)
 assert.throws(()=>normalizeActionProposal({operations:[{...operation,targetId:'model'}]},{member:'Larry',role:'admin'}),/stable/)
})

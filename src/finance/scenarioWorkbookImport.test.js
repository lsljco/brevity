import test from 'node:test'
import assert from 'node:assert/strict'
import {scenariosFromCells,validateScenarioImport} from './scenarioWorkbookImport.js'
import {calculateScenario} from './scenarioModelingData.js'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
const cells={A2:'Test case',A3:'Description',A4:'Salary',B4:6000,C4:80000,D4:1,E4:'Unconfirmed',A5:'Possible role',B5:null,C5:null,B16:6000,C18:1500,F18:18000,C20:46753,C21:9000,C22:1000,C23:0,C24:10500,A29:46327,B29:'November Cashflow',C29:1500,D29:10500,E29:'Retain reserve'}
test('scenario workbook import preserves blanks, work uncertainty, percentages and saved payoff evidence',()=>{
 const imported=scenariosFromCells(cells,'example.xlsx'),s=imported.scenarios[0]
 assert.equal(s.planningExpense,4500);assert.equal(s.incomes[0].contribution,100);assert.equal(s.incomes[0].remote,null);assert.equal(s.incomes[1].monthlyNet,null)
 assert.equal(calculateScenario(s,s.planningExpense).monthlyCashFlow,1500)
 assert.equal(s.source.summary.payoff,'2028-01-01');assert.equal(s.source.schedule[0][0],'2026-11-01')
 assert.deepEqual(validateScenarioImport(imported),imported)
})
test('import fails closed for missing sheet data, inconsistent totals, duplicate cases and invalid numbers',()=>{
 assert.throws(()=>scenariosFromCells({},'example.xlsx'),/1–24/)
 assert.throws(()=>scenariosFromCells({...cells,B16:9000},'example.xlsx'),/disagree/)
 const x=scenariosFromCells(cells,'example.xlsx');x.scenarios.push(structuredClone(x.scenarios[0]));assert.throws(()=>validateScenarioImport(x),/Duplicate/)
 const y=scenariosFromCells(cells,'example.xlsx');y.scenarios[0].source.schedule[0][2]=Infinity;assert.throws(()=>validateScenarioImport(y),/amount/)
})
test('reviewed workbook replacement targets only forecasts, preserves recovery plans and keeps prior state',()=>{
 const x=scenariosFromCells(cells,'example.xlsx'),before={scenarios:[{id:'old'}],recoveryPlans:[{id:'recovery-test',assumptions:{reserve:10}}]}
 const operation={type:'forecast.update',targetId:'model',description:'Import workbook',payload:{scenarioImportJson:JSON.stringify(x)}}
 const proposal=normalizeActionProposal({operations:[operation]},{member:'Larry',role:'admin'})
 assert.equal(resourceForOperation(proposal.operations[0]),'shared:brevity_finance_scenarios_v1')
 const result=applyRecordOperation(before,proposal.operations[0],{actor:'Larry'})
 assert.deepEqual(result.before,before);assert.deepEqual(result.after.recoveryPlans,before.recoveryPlans);assert.equal(result.after.scenarios.length,1);assert.equal(result.after.workbookImport.filename,'example.xlsx')
 assert.deepEqual(before.scenarios,[{id:'old'}])
 assert.throws(()=>normalizeActionProposal({operations:[{...operation,targetId:'wrong'}]},{member:'Larry',role:'admin'}),/target only/)
})
test('favorites survive reimport of the same case but do not move to a replaced case',()=>{
 const imported=scenariosFromCells(cells,'example.xlsx'),scenario=imported.scenarios[0]
 const apply=(state,payload,targetId=scenario.id)=>applyRecordOperation(state,normalizeActionProposal({operations:[{type:'forecast.update',targetId,payload}]},{member:'Larry',role:'admin'}).operations[0]).after
 const initial={scenarios:[scenario],recoveryPlans:[{id:'preserved'}]}
 const starred=apply(initial,{favorite:true})
 assert.equal(starred.scenarios[0].favorite,true)
 assert.deepEqual(starred.scenarios[0].incomes,scenario.incomes)
 assert.equal(initial.scenarios[0].favorite,undefined)
 const refreshed=apply(starred,{scenarioImportJson:JSON.stringify(imported)},'model')
 assert.equal(refreshed.scenarios[0].favorite,true)
 assert.deepEqual(refreshed.recoveryPlans,initial.recoveryPlans)
 assert.equal(apply(refreshed,{favorite:false}).scenarios[0].favorite,false)
 imported.scenarios[0].title='Different case in same column'
 assert.equal(apply(starred,{scenarioImportJson:JSON.stringify(imported)},'model').scenarios[0].favorite,false)
 assert.throws(()=>apply(initial,{favorite:'false'}),/Favorite must/)
 assert.throws(()=>apply(initial,{favorite:true},'model'),/model update/)
})

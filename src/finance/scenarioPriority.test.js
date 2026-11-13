import test from 'node:test'
import assert from 'node:assert/strict'
import {reorderLiability} from './scenarioPriority.js'
import {createStudio,projectStudio,validateStudio} from './scenarioStudioModel.js'
const rows=()=>['Property tax','Income tax','Card 1','Card 2','Card 3','Card 4','Card 5'].map((name,i)=>({id:`d${i}`,name,balance:100,payment:0,apr:0,dueDay:1,include:true,method:'Principal only'}))
test('moving priority seven to four preserves all debts and tax groups without mutation',()=>{
 const original=rows(),before=structuredClone(original),moved=reorderLiability(original,'d6','d3')
 assert.deepEqual(moved.map(r=>r.id),['d0','d1','d2','d6','d3','d4','d5']);assert.deepEqual(original,before)
 assert.equal(reorderLiability(original,'d6','d0'),null)
 assert.equal(reorderLiability(original,'missing','d3'),null)
 const a=createStudio({incomes:[{monthlyNet:8000}]},5000,[],'2026-01-01');a.openingCash=24000;a.liabilities=moved;a.strategy='priority'
 assert.deepEqual(projectStudio(validateStudio(a)).payoffs.map(p=>p.id),moved.map(r=>r.id))
})

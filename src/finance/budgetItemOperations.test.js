import test from 'node:test'
import assert from 'node:assert/strict'
import {budgetItemOperations} from './budgetItemOperations.js'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {meetingBudgetActual} from './meetingBudgetActual.js'
const base={name:'Gasoline',category:'Fuel',direction:'expense',accountId:'a',amount:'150.50',month:'2027-01',repeat:true}
test('new expense and income budgets persist all twelve months without scheduling cash or truncating review',()=>{
 for(const direction of ['expense','income']){
  const operations=budgetItemOperations({...base,direction},()=>direction)
  const proposal=normalizeActionProposal({operations},{member:'Larry',role:'admin'})
  assert.equal(proposal.operations.length,12)
  let value={unrelated:'retained'}
  for(const op of proposal.operations)value=applyRecordOperation(value,op).after
  const model=meetingBudgetActual({accounts:[{id:'a',name:'Operating',plaidAccountId:'bank'}],budget:value,transactionFreshnessStatus:'fresh'},'2027-12','2027-12-31')
  assert.equal(model.rows.find(r=>r.direction===direction).budget,150.50)
  assert.equal(Object.keys(value.lines).length,1);assert.equal(value.unrelated,'retained')
  assert.ok(proposal.operations.every(op=>op.type==='budget.update'))
 }
})
test('editing an existing item reuses its exact stable identity and leaves other months unchanged',()=>{
 const line={id:'existing',recordId:'bill',accountId:'a',direction:'expense',name:'Fuel allowance',category:'Fuel'}
 const ops=budgetItemOperations({...base,line,repeat:false})
 assert.equal(ops.length,1);assert.equal(ops[0].targetId,'existing');assert.equal(ops[0].payload.recordId,'bill');assert.equal(ops[0].payload.lineName,'Fuel allowance')
 assert.throws(()=>budgetItemOperations({...base,line:{...line,accountId:'other'}}),/different account/)
 assert.throws(()=>budgetItemOperations({...base,amount:''}),/Enter/)
 assert.throws(()=>budgetItemOperations({...base,month:'2027-13'}),/Enter/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildScheduledActionPayload, scheduledActionScope } from './scheduledActionReview.js'
import { normalizeActionProposal, selectedOperation } from '../../netlify/lib/assistant-action-contract.mjs'
import { applyRecordOperation } from '../../netlify/lib/assistant-action-executor.mjs'

test('moving a one-time mortgage earlier does not emit a series end-date change', () => {
  const current={id:'mortgage',name:'Mortgage',freq:'once',start:'2026-10-21',end:'2026-10-21',amount:11355.71,type:'expense',acct:'cash'}
  const moved={...current,start:'2026-10-20',end:'2026-10-20'}
  assert.deepEqual(buildScheduledActionPayload(moved,{current,occurrenceDate:current.start}),{date:'2026-10-20'})
  assert.deepEqual(scheduledActionScope(current,{occurrence:true,requestedScope:'one'}),{allowedScopes:['this-item'],defaultScope:'this-item'})
})

test('mortgage move survives Action Mode normalization and execution as this item only', () => {
  const current={id:'mortgage',name:'Mortgage',freq:'once',start:'2026-10-21',end:'2026-10-21',amount:11355.71,type:'expense',acct:'cash'}
  const payload=buildScheduledActionPayload({...current,start:'2026-10-20',end:'2026-10-20'},{current,occurrenceDate:current.start})
  const proposal=normalizeActionProposal({operations:[{type:'recurring.update',targetId:current.id,targetDate:current.start,payload,...scheduledActionScope(current)}]},{member:'Larry',role:'admin'})
  const operation=selectedOperation(proposal.operations[0],'this-item')
  assert.equal(operation.selectedScope,'this-item')
  const result=applyRecordOperation({accounts:[{id:'cash'}],transactions:[current]},operation,()=> 'unused')
  assert.equal(result.after.transactions.length,1)
  assert.equal(result.after.transactions[0].id,current.id)
  assert.equal(result.after.transactions[0].start,'2026-10-20')
  assert.equal(result.after.transactions[0].end,'2026-10-20')
  assert.equal(result.after.transactions[0].amount,11355.71)
})

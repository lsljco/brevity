import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAutoReconciliationReport, reconciliationOperation } from './autoReconciliation.js'
import { normalizeActionProposal, defaultActionPermissions } from '../../netlify/lib/assistant-action-contract.mjs'
import { prepareDirectProposal } from '../../netlify/functions/brevity-assistant-actions.mjs'
import { executeRecordOperations } from '../../netlify/lib/assistant-action-executor.mjs'
import { reconcileFinanceDay } from './reconciliation.js'
import { txOccursOnDate } from './projection.js'
const today='2026-10-01', now=()=>new Date('2026-10-01T12:00:00Z')
const plan={id:'sawnee',name:'Sawnee EMC - Electric',type:'expense',amount:1204,acct:'operating',freq:'monthly',start:'2026-08-02'}
const bank={id:'sawnee-posted',name:'SAWNEE EMC BANK DRAFT 2580246393',date:'2026-09-30',amount:1210,accountId:'bank-operating',pending:false}
const account={id:'operating',name:'Operating',type:'checking',plaidAccountId:'bank-operating',plaidType:'depository',plaidSubtype:'checking'}
const input={scheduled:[plan],actuals:[bank],accounts:[account],today}
const report=(changes={})=>buildAutoReconciliationReport({...input,...changes})
function resourcesFixture(){
 let finance={transactions:[structuredClone(plan)],accounts:[account]},version=3,actuals=[structuredClone(bank)],writes=0
 return { snapshot:()=>structuredClone(finance),get writes(){return writes},setActuals:rows=>{actuals=rows},
 async read(key){if(key==='shared:plaid_actuals_cache')return{value:actuals,version:1};assert.equal(key,'shared:lslj_finance_v9');return{value:structuredClone(finance),version}},
 async write(key,value,expected){assert.equal(key,'shared:lslj_finance_v9');assert.equal(expected,version);finance=structuredClone(value);version++;writes++;return{value:structuredClone(finance),version}}
 }
}
const session={member:'Larry',role:'admin'}, permissions=defaultActionPermissions('admin')
const proposalInput=()=>({summary:'Review reconciliation',expectedVersion:3,operations:report().suggestions.map(reconciliationOperation)})

test('automatically assesses Sawnee with a small variance without changing either source',()=>{
 const before=JSON.stringify(input),result=report()
 assert.equal(result.suggestions.length,1)
 assert.equal(result.suggestions[0].occurrenceDate,'2026-10-02')
 assert.equal(result.suggestions[0].amountVariance,6)
 assert.equal(JSON.stringify(input),before)
 assert.equal(report({actuals:[{...bank,pending:true}]}).suggestions.length,0)
 for(const changes of [{amount:1300},{accountId:'another-account'},{name:'Sony Electronics'},{date:'2026-09-20'}])assert.equal(report({actuals:[{...bank,...changes}]}).suggestions.length,0)
})

test('multiple bank candidates or nearby occurrences stay ambiguous and unselected',()=>{
 assert.equal(report({actuals:[bank,{...bank,id:'second'}]}).suggestions.length,0)
 const weekly={...plan,freq:'weekly',start:'2026-09-18'}
 const result=report({scheduled:[weekly]})
 assert.equal(result.suggestions.length,0)
 assert.ok(result.ambiguous.length>1)
})

test('review preparation is read-only; explicit execution moves and links one occurrence, retaining budget and variance',async()=>{
 const resources=resourcesFixture()
 const proposal=await prepareDirectProposal({input:proposalInput(),session,permissions,repository:{saveProposal:async()=>{}},resources,now:now(),id:'review-reconciliation'})
 assert.equal(resources.writes,0)
 assert.deepEqual(resources.snapshot().transactions,[plan])
 const result=await executeRecordOperations({proposal,session,permissions,resources,now})
 assert.equal(resources.writes,1)
 const saved=resources.snapshot(),moved=saved.transactions.find(row=>row.reconciliation)
 assert.equal(moved.start,bank.date);assert.equal(moved.freq,'once');assert.equal(moved.amount,1204)
 assert.equal(moved.reconciliation.actualId,bank.id);assert.equal(moved.reconciliation.approvedBy,'Larry')
 assert.equal(saved.transactions.filter(tx=>txOccursOnDate(tx,new Date('2026-10-02T12:00:00'))).length,0)
 assert.equal(saved.transactions.filter(tx=>txOccursOnDate(tx,new Date('2026-11-02T12:00:00'))).length,1)
 assert.equal(report({scheduled:saved.transactions}).suggestions.length,0)
 const reconciliation=reconcileFinanceDay({scheduled:saved.transactions,actuals:[bank],date:bank.date,exactAmounts:true,accountMap:{'bank-operating':'operating'}})
 assert.equal(reconciliation.matched,1);assert.equal(reconciliation.rows[0].amountVariance,6);assert.equal(reconciliation.rows[0].approved,true)
 assert.deepEqual(result.changes[0].before.transactions,[plan],'original records retained for journal Undo')
 const changedBank={...bank,name:'SAWNEE EMC CORRECTED DRAFT'}
 const changed=reconcileFinanceDay({scheduled:saved.transactions,actuals:[changedBank],date:bank.date,exactAmounts:true,accountMap:{'bank-operating':'operating'}})
 assert.equal(changed.matched,0,'changed source cannot silently replace an approved link')
 await assert.rejects(executeRecordOperations({proposal,session,permissions,resources,now}),/changed/)
})

test('changed or deleted bank charge after review blocks execution before any write',async()=>{
 for(const actuals of [[],[{...bank,amount:1211}],[{...bank,pending:true}],[bank,{...bank,id:'duplicate'}]]){
 const resources=resourcesFixture()
 const proposal=await prepareDirectProposal({input:proposalInput(),session,permissions,repository:{saveProposal:async()=>{}},resources,now:now(),id:'stale-bank'})
 resources.setActuals(actuals)
 await assert.rejects(executeRecordOperations({proposal,session,permissions,resources,now}),/changed|unique match/)
 assert.equal(resources.writes,0)
 }
})

test('reconciliation cannot change the series or silently replace the budget',()=>{
 const operation=reconciliationOperation(report().suggestions[0])
 for(const change of [{allowedScopes:['this-and-future']},{payload:{...operation.payload,amount:1210}},{payload:{...operation.payload,date:'2026-10-02'}}])assert.throws(()=>normalizeActionProposal({operations:[{...operation,...change}]},session),/Reconciliation must/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {saveCategory,categoryId,resolveCategory,categoryRows} from './categoryCatalog.js'
import {normalizeActionProposal,defaultActionPermissions,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,prepareRecordOperations,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {suggestionOperation} from './ruleSuggestions.js'
const bulk=(ids=['bank1'],extra={})=>normalizeActionProposal({operations:[{type:'transaction.bulk.update',payload:{transactionIds:ids,category:'Fuel',sourceVersion:7,...extra}}]},{member:'Larry',role:'admin'})
test('category rename retains stable identity, aliases, transaction ids, amounts and split amounts',()=>{
 const before={accounts:[{balance:123}],transactions:[{id:'p1',cat:'Transportation',amount:99,splits:[{cat:'Transportation',amount:99}]}]}
 const op={type:'finance.category.save',targetId:categoryId('Transportation'),payload:{category:'Transportation',name:'Fuel',enabled:true}}
 const after=saveCategory(before,op),row=after.categoryCatalog[0]
 assert.equal(row.id,op.targetId);assert.equal(resolveCategory('TRANSPORTATION',after.categoryCatalog),'Fuel');assert.equal(after.transactions[0].cat,'Fuel');assert.equal(after.transactions[0].splits[0].cat,'Fuel');assert.equal(after.transactions[0].amount,99);assert.deepEqual(after.accounts,before.accounts);assert.equal(before.transactions[0].cat,'Transportation')
 const next=saveCategory(after,{...op,payload:{name:'Gasoline',enabled:false}})
 assert.equal(resolveCategory('Transportation',next.categoryCatalog),'Gasoline');assert.equal(resolveCategory('Fuel',next.categoryCatalog),'Gasoline');assert.equal(categoryRows(['Transportation'],next.categoryCatalog).length,1);assert.equal(next.categoryCatalog[0].enabled,false)
 assert.throws(()=>saveCategory(after,{...op,payload:{name:'Transfer'}}),/reserved/)
 assert.throws(()=>saveCategory(after,{payload:{name:'Fuel'}}),/already exists/)
})
test('category-only rules do not require a vendor and continue targeting past and future matches',()=>{
 const row={title:'RaceTrac',category:'Fuel',criteria:[{field:'merchantName',operator:'contains',value:'RaceTrac',join:'and'}],vendorId:'',accountId:'',createdDate:'2026-11-16'}
 const op=normalizeActionProposal({operations:[suggestionOperation(row,'2026-11-16')]},{member:'Larry',role:'admin'}).operations[0]
 const rule=applyRecordOperation([],op,()=> 'rule1').after[0]
 assert.equal(rule.actions.updateCategory.value,'Fuel');assert.equal(rule.actions.assignVendor,undefined);assert.equal(rule.applyToExisting,true)
})
test('bulk edit retains every selected id, existing metadata, and leaves unselected records untouched',()=>{
 const ids=Array.from({length:2763},(_,i)=>`bank${i}`),proposal=bulk(ids),operation=proposal.operations[0],before={bank0:{name:'Original',notes:'Keep',budgetLineId:'old'},other:{category:'Housing'}}
 assert.equal(operation.payload.transactionIds.length,2763)
 const after=applyRecordOperation(before,operation).after
 assert.equal(after.bank2762.category,'Fuel');assert.equal(after.bank0.notes,'Keep');assert.equal(after.bank0.budgetLineId,null);assert.deepEqual(after.other,before.other);assert.equal(before.bank0.category,undefined);assert.equal(after.bank0.amount,undefined)
 assert.equal(resourceForOperation(operation),'shared:lslj_tx_overrides_v1')
 assert.equal(permissionForOperation({operation,member:'Nyla',role:'member',permissions:defaultActionPermissions('member')}).allowed,false)
 assert.throws(()=>bulk(['same','same']),/distinct/);assert.throws(()=>bulk([]),/distinct/);assert.throws(()=>bulk(['x'],{sourceVersion:-1}),/source/)
})
test('bulk preparation rejects changed bank snapshots, pending rows, missing rows and transfers',async()=>{
 const run=async(bank,version=7)=>{const proposal=bulk();proposal.expectedVersions={'shared:lslj_tx_overrides_v1':1};return prepareRecordOperations({proposal,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources:{read:async resource=>resource==='shared:plaid_actuals_cache'?{value:bank,version}:{value:{},version:1}}})}
 const valid={id:'bank1',amount:20,category:'TRANSPORTATION',pending:false}
 assert.equal((await run([valid])).prepared.length,1)
 await assert.rejects(()=>run([valid],8),/changed/)
 for(const rows of [[],[{...valid,pending:true}],[{...valid,category:'TRANSFER_OUT'}]])await assert.rejects(()=>run(rows),/posted non-transfer/)
})

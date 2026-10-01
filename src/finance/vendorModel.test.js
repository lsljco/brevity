import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyVendors,applyVendorOperation,normalizeVendorPayload,vendorActivity,vendorForExpense,VENDOR_RESOURCE} from './vendorModel.js'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {prepareRecordOperations,commitPreparedRecordOperations,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
const create=()=>applyVendorOperation(emptyVendors(),{type:'vendor.create',payload:{name:'Sample Insurance',website:'https://example.com',accessMembers:[]}},()=> 'vendor-1')
test('posted vendor lineage uses only the provider ID and preserves explicit override and Undo',()=>{
 const workspace=create();workspace.links['posted:pending-1']='vendor-1'
 const posted={id:'posted-1',pending:false,pendingTransactionId:'pending-1',amount:115,name:'Changed merchant',date:'2026-10-01'}
 assert.equal(vendorForExpense(workspace,'posted',posted),'vendor-1')
 assert.equal(vendorActivity(workspace,[posted]).totals['vendor-1'].net,115)
 for(const tx of [{...posted,pending:true},{...posted,pendingTransactionId:null},{...posted,pendingTransactionId:'unrelated'}])assert.equal(vendorForExpense(workspace,'posted',tx),'')
 workspace.links['posted:posted-1']='vendor-2'
 assert.equal(vendorForExpense(workspace,'posted',posted),'vendor-2')
 delete workspace.links['posted:posted-1'] // Undo of posted override restores original provenance.
 assert.equal(vendorForExpense(workspace,'posted',posted),'vendor-1')
 delete workspace.links['posted:pending-1'] // Undo of original reviewed assignment removes derived association.
 assert.equal(vendorForExpense(workspace,'posted',posted),'')
})
test('vendor records default to administrator-only access and accept reviewed contact updates',()=>{let value=create();assert.deepEqual(value.vendors[0].accessMembers,[]);value=applyVendorOperation(value,{type:'vendor.update',targetId:'vendor-1',payload:{address:'123 Sample Lane',phone:'555-0100',accessMembers:['Terica']}},()=> 'new');assert.equal(value.vendors[0].address,'123 Sample Lane');assert.deepEqual(value.vendors[0].accessMembers,['Terica']);assert.throws(()=>normalizeVendorPayload('vendor.update',{password:'never in ordinary records'}),/protected/);assert.throws(()=>normalizeVendorPayload('vendor.update',{website:'javascript:alert(1)'}));assert.throws(()=>normalizeVendorPayload('vendor.update',{website:'https://user:secret@example.com'}))})
test('vendor spending deduplicates posted activity, separates pending and planned, excludes transfers, and nets assigned credits',()=>{const value=create();value.links={'posted:a':'vendor-1','posted:refund':'vendor-1','posted:pending':'vendor-1','posted:transfer':'vendor-1','planned:plan':'vendor-1'};const result=vendorActivity(value,[{id:'a',amount:100,date:'2026-09-30'},{id:'a',amount:100,date:'2026-09-30'},{id:'refund',amount:-20,date:'2026-09-30'},{id:'pending',amount:50,pending:true,date:'2026-09-30'},{id:'transfer',amount:500,category:'TRANSFER_OUT',date:'2026-09-30'},{id:'unassigned',amount:30,date:'2026-09-30'}],[{id:'plan',vendorId:'vendor-1',type:'expense',amount:1200,freq:'yearly'}]);assert.deepEqual(result.totals['vendor-1'],{charges:100,credits:20,pending:50,net:80,count:2});assert.equal(result.unassigned.length,1);assert.equal(result.planned.length,1);assert.deepEqual(vendorActivity(value,[{id:'a',amount:100,date:'2026-08-30'}],[],{dateFrom:'2026-09-01'}).totals,{})})
test('archiving preserves expense references and original snapshot for safe Undo',()=>{const before=create();before.links['posted:expense-1']='vendor-1';const after=applyVendorOperation(before,{type:'vendor.archive',targetId:'vendor-1',payload:{}},()=> 'new');assert.equal(before.vendors[0].archived,false);assert.equal(after.vendors[0].archived,true);assert.equal(after.links['posted:expense-1'],'vendor-1');assert.throws(()=>applyVendorOperation(after,{type:'vendor.expense.link',payload:{vendorId:'vendor-1',expenseKind:'posted',expenseId:'a'}},()=> 'new'))})
test('vendor edits use the existing strong-review versioned journal and fail stale writes',async()=>{let value=create(),version=2;const resources={read:async()=>({value,version}),write:async(resource,next,expected)=>{assert.equal(resource,VENDOR_RESOURCE);assert.equal(expected,version);value=next;version++;return{value,version}}};const proposal=normalizeActionProposal({operations:[{type:'vendor.update',targetId:'vendor-1',payload:{phone:'555-0111'}}]},{member:'Larry',role:'admin'});proposal.expectedVersions={[VENDOR_RESOURCE]:2};assert.equal(resourceForOperation(proposal.operations[0]),VENDOR_RESOURCE);const plan=await prepareRecordOperations({proposal,session:{member:'Larry',role:'admin'},permissions:{finance:true},resources});assert.equal(value.vendors[0].phone,undefined);const changes=await commitPreparedRecordOperations({prepared:plan.prepared,session:{member:'Larry'},resources,mutationId:'journal-1'});assert.equal(value.vendors[0].phone,'555-0111');assert.equal(changes[0].before.vendors[0].phone,undefined);await assert.rejects(()=>prepareRecordOperations({proposal,session:{member:'Larry',role:'admin'},permissions:{finance:true},resources}),/changed/);proposal.expectedVersions={[VENDOR_RESOURCE]:version};await assert.rejects(()=>prepareRecordOperations({proposal,session:{member:'Terica',role:'member'},permissions:{finance:true},resources}),/administrator/)})
test('protected attachments cannot substitute metadata or another vendor upload',async()=>{const value=create();const proposal=normalizeActionProposal({operations:[{type:'vendor.document.attach',targetId:'vendor-1',payload:{blobId:'blob-1',fileName:'policy.pdf',mimeType:'application/pdf',size:30}}]},{member:'Larry',role:'admin'});proposal.expectedVersions={[VENDOR_RESOURCE]:0};const input={proposal,session:{member:'Larry',role:'admin'},permissions:{finance:true},resources:{read:async()=>({value,version:0})},vendorVaultFactory:()=>({metadata:async()=>({vendorId:'vendor-other',kind:'document',metadata:{fileName:'policy.pdf',mimeType:'application/pdf',size:30}})})};await assert.rejects(()=>prepareRecordOperations(input),/different vendor/);input.vendorVaultFactory=()=>({metadata:async()=>({vendorId:'vendor-1',kind:'document',metadata:{fileName:'different.pdf',mimeType:'application/pdf',size:30}})});await assert.rejects(()=>prepareRecordOperations(input),/metadata changed/)})

test('renaming a vendor updates cross-screen labels without changing expense identity, amounts or ordering totals',async()=>{
 const {decorateVendorTransactions}=await import('./vendorModel.js')
 const {sortAndFilterTransactions}=await import('./transactionList.js')
 const {buildBudgetLines}=await import('./budgetBreakdown.js')
 let value=create();value=applyVendorOperation(value,{type:'vendor.create',payload:{name:'Alpha Utility'}},()=> 'vendor-2')
 value.links={'posted:a':'vendor-1','posted:b':'vendor-2'}
 const source=[{id:'a',amount:100,date:'2026-09-30'},{id:'b',amount:20,date:'2026-09-29'},{id:'c',amount:30,date:'2026-09-28'}]
 value=applyVendorOperation(value,{type:'vendor.update',targetId:'vendor-1',payload:{name:'Zeta Insurance'}},()=> '')
 const rows=decorateVendorTransactions(source,value,'posted','asc')
 assert.deepEqual(rows.map(x=>x.id),['b','c','a']);assert.equal(rows.reduce((sum,x)=>sum+x.amount,0),150)
 assert.equal(source[0].vendorName,undefined)
 assert.deepEqual(sortAndFilterTransactions(rows,{vendor:'Zeta'}).map(x=>x.id),['a'])
 assert.deepEqual(decorateVendorTransactions(source,value,'posted','desc').map(x=>x.id),['a','c','b'])
 const planned=decorateVendorTransactions([{id:'plan',acct:'account',name:'Policy',type:'expense',freq:'monthly',cat:'Insurance',vendorId:'vendor-1',amount:100}],value,'planned')
 assert.equal(buildBudgetLines(planned,{}, {vendorOrder:'asc'})[0].vendorName,'Zeta Insurance')
 assert.throws(()=>applyVendorOperation(value,{type:'vendor.update',targetId:'vendor-1',payload:{name:'Alpha Utility'}},()=> ''),/unique/)
})

test('projects and debts carry canonical vendor IDs through reviewed writes and reject unavailable relationships',async()=>{
 const {applyRecordOperation}=await import('../../netlify/lib/assistant-action-executor.mjs')
 for(const type of ['project.create','debt.create']){
  const payload=type==='project.create'?{title:'Roof repair',vendorId:'vendor-1'}:{creditor:'Insurance financing',vendorId:'vendor-1'}
  const proposal=normalizeActionProposal({operations:[{type,payload}]},{member:'Larry',role:'admin'})
  const operation=proposal.operations[0],resource=resourceForOperation(operation)
  proposal.expectedVersions={[resource]:0}
  const resources={read:async key=>({version:0,value:key===VENDOR_RESOURCE?create():[]})}
  const result=await prepareRecordOperations({proposal,session:{member:'Larry',role:'admin'},permissions:{finance:true,projects:true},resources})
  assert.equal(result.prepared[0].after[0].vendorId,'vendor-1')
  operation.payload.vendorId='missing'
  await assert.rejects(()=>prepareRecordOperations({proposal,session:{member:'Larry',role:'admin'},permissions:{finance:true,projects:true},resources}),/available vendor/)
 }
})

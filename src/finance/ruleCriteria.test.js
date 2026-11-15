import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeRuleCriteria,describeRuleCriteria} from './ruleCriteria.js'
import {transactionMatchesRule,applyTransactionRules} from './transactionRules.js'
import {vendorForExpense,VENDOR_RESOURCE} from './vendorModel.js'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,prepareRecordOperations,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
const text=(value,join='and')=>({field:'originalStatement',operator:'contains',value,join})
const amount=(value,operator='greater',join='and')=>({field:'amount',operator,value,join})
const rule=criteria=>({criteria,applyToExisting:true,conditions:{}})
test('transfer criteria use amount magnitude, exact boundaries, direction and original statement',()=>{
 const criteria=[text('from *248'),amount(500),{field:'direction',operator:'equals',value:'income',join:'and'}]
 const tx={originalStatement:'OLB Transfer from *248 to *200',amount:-501}
 assert.equal(transactionMatchesRule(tx,rule(criteria)),true)
 for(const change of [{amount:-500},{amount:501},{originalStatement:'from *849'},{pending:true}])assert.equal(transactionMatchesRule({...tx,...change},rule(criteria)),false)
 assert.equal(transactionMatchesRule(tx,{...rule(criteria),applyToExisting:false,createdDate:'2026-11-14'}),false)
})
test('mixed AND/OR has explicit AND grouping and scope applies to every alternative',()=>{
 const criteria=[text('Genesco'),amount(500),text('Payroll','or'),amount(1000)]
 const r={...rule(criteria),conditions:{accounts:{on:true,value:'a'}}},accounts=[{id:'a',plaidAccountId:'bank-a'}]
 for(const [name,n,expected] of [['Genesco',501,true],['Genesco',400,false],['Payroll',1001,true],['Payroll',600,false]])assert.equal(transactionMatchesRule({name,amount:-n,accountId:'bank-a'},r,accounts),expected)
 assert.equal(transactionMatchesRule({name:'Payroll',amount:-2000,accountId:'other'},r,accounts),false)
 assert.match(describeRuleCriteria(criteria),/^\(.* AND .*\) OR \(.* AND .*\)$/)
})
test('all comparisons and malformed criteria fail closed',()=>{
 for(const [operator,value,max,n,expected] of [['equals',500,undefined,500,true],['equals',500,undefined,501,false],['less',500,undefined,500,false],['less',500,undefined,499,true],['between',100,200,200,true],['between',100,200,201,false]])assert.equal(transactionMatchesRule({amount:n},rule([{field:'amount',operator,value,max}])),expected)
 for(const invalid of [[],Array(6).fill(text('x')),[text('')],[amount('')],[amount('NaN')],[amount(-1)],[{...text('x'),operator:'unknown'}],[text('x'),{...text('y'),join:'xor'}]]){
  assert.throws(()=>normalizeRuleCriteria(invalid));assert.equal(transactionMatchesRule({name:'x',amount:600},rule(invalid)),false)
 }
})
test('approved rule persists criteria and vendor, and preview agrees with saved rule',()=>{
 const criteria=[text('from *248'),amount(500)]
 const proposal=normalizeActionProposal({operations:[{type:'transaction.rule.create',payload:{criteria,vendorId:'genesco',category:'LJ Genesco Income',createdDate:'2026-11-14',applyToExisting:true}}]},{member:'Larry',role:'admin'})
 const saved=applyRecordOperation([],proposal.operations[0],()=> 'rule').after[0]
 assert.deepEqual(saved.criteria,normalizeRuleCriteria(criteria));assert.equal(saved.actions.assignVendor.value,'genesco')
 const tx={id:'income',name:'Transfer from *248',amount:-800,pending:false,date:'2026-11-14'}
 const updated=applyTransactionRules(tx,[saved]);assert.equal(updated.category,'LJ Genesco Income');assert.equal(updated.amount,-800)
 const directory={vendors:[{id:'genesco',name:'Genesco'}],links:{}}
 assert.equal(vendorForExpense(directory,'posted',updated),'genesco')
 assert.equal(vendorForExpense({...directory,links:{'posted:income':'manual'}},'posted',updated),'manual')
 assert.equal(vendorForExpense(directory,'posted',applyTransactionRules(tx,[])),'')
 assert.equal(vendorForExpense({vendors:[{id:'genesco',archived:true}]},'posted',updated),'')
})
test('server rejects unavailable vendor and invalid criteria before saving',async()=>{
 const input={operations:[{type:'transaction.rule.create',payload:{criteria:[text('payroll')],vendorId:'missing',category:'Salary',createdDate:'2026-11-14'}}]}
 const proposal=normalizeActionProposal(input,{member:'Larry',role:'admin'}),resource=resourceForOperation(proposal.operations[0]);proposal.expectedVersions={[resource]:0}
 await assert.rejects(()=>prepareRecordOperations({proposal,session:{member:'Larry',role:'admin'},permissions:{finance:true},resources:{read:async key=>({version:0,value:key===VENDOR_RESOURCE?{vendors:[]}:[]})}}),/available vendor/)
 input.operations[0].payload.criteria=Array(6).fill(text('x'));assert.throws(()=>normalizeActionProposal(input,{member:'Larry',role:'admin'}),/five/)
})

test('editing a legacy rule keeps identity, position and unrelated actions while replacing its criteria',async()=>{
 const {criteriaForSavedRule}=await import('./ruleCriteria.js')
 const legacy={id:'legacy',name:'Original rule',createdDate:'2026-10-01',applyToExisting:true,conditions:{originalStatement:{on:true,match:'contains',value:'Market'},merchantName:{on:true,match:'starts',value:'Market'},amount:{on:true,min:'10',max:'100'},accounts:{on:true,value:'a'},categories:{on:true,value:'Food'}},actions:{updateCategory:{on:true,value:'Groceries'},assignVendor:{on:true,value:'old-vendor'},addTags:{on:true,value:'family'}},splits:[{cat:'Food',amount:10}]}
 const criteria=criteriaForSavedRule(legacy)
 assert.equal(criteria.length,4)
 assert.equal(transactionMatchesRule({name:'Market',category:'Food',amount:10,accountId:'a'},rule(criteria)),true)
 const proposal=normalizeActionProposal({operations:[{type:'transaction.rule.update',targetId:'legacy',payload:{title:'Renamed rule',criteria:[text('New Market')],category:'Household',vendorId:'',accountId:'',applyToExisting:false,createdDate:'2026-10-01'}}]},{member:'Larry',role:'admin'})
 const before=[{id:'first'},legacy,{id:'last'}],result=applyRecordOperation(before,proposal.operations[0])
 assert.deepEqual(result.after.map(r=>r.id),['first','legacy','last'])
 const edited=result.after[1]
 assert.equal(edited.name,'Renamed rule');assert.equal(edited.createdDate,'2026-10-01')
 assert.deepEqual(edited.actions.addTags,legacy.actions.addTags);assert.deepEqual(edited.splits,legacy.splits)
 assert.equal(edited.actions.assignVendor.on,false)
 assert.equal(transactionMatchesRule({name:'Market',amount:20,date:'2026-11-01'},edited),false)
 assert.equal(transactionMatchesRule({name:'New Market',amount:200,date:'2026-11-01'},edited),true)
 assert.deepEqual(result.before,before)
 assert.throws(()=>applyRecordOperation([],proposal.operations[0]),/no longer exists/)
 assert.throws(()=>normalizeActionProposal({operations:[{type:'transaction.rule.update',payload:proposal.operations[0].payload}]},{member:'Larry',role:'admin'}),/exact.*id/)
})
test('legacy one-sided amount bounds preserve inclusive matching when edited',async()=>{
 const {criteriaForSavedRule}=await import('./ruleCriteria.js')
 for(const [min,max,pass,fail] of [['10','',10,9],['','100',100,101]]){
  const criteria=criteriaForSavedRule({conditions:{amount:{on:true,min,max}}})
  assert.equal(transactionMatchesRule({amount:pass},rule(criteria)),true)
  assert.equal(transactionMatchesRule({amount:fail},rule(criteria)),false)
 }
})
test('rule update validates vendor access and rejects stale versions',async()=>{
 const saved={id:'existing',name:'Rule',actions:{},conditions:{}}
 const proposal=normalizeActionProposal({operations:[{type:'transaction.rule.update',targetId:'existing',payload:{criteria:[text('payroll')],vendorId:'v1',category:'Salary',createdDate:'2026-11-14'}}]},{member:'Larry',role:'admin'})
 const resource=resourceForOperation(proposal.operations[0]);proposal.expectedVersions={[resource]:2}
 let version=2,vendors=[{id:'v1',name:'Payer',accessMembers:[]}]
 const resources={read:async key=>key===VENDOR_RESOURCE?{version:1,value:{vendors}}:{version,value:[saved]}}
 const args={proposal,session:{member:'Larry',role:'admin'},permissions:{finance:true},resources}
 const prepared=await prepareRecordOperations(args)
 assert.equal(prepared.prepared[0].after[0].actions.assignVendor.value,'v1')
 vendors=[];await assert.rejects(()=>prepareRecordOperations(args),/available vendor/)
 version=3;await assert.rejects(()=>prepareRecordOperations(args),/changed|version|refresh/i)
})

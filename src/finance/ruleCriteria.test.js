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

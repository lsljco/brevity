import test from 'node:test'
import assert from 'node:assert/strict'
import {loadExecutiveFinancialEvidence,executiveFinancialModelContext,validateStrategicBrief} from '../../netlify/lib/executive-briefing.mjs'
import {evidenceCSV,briefingHTML} from '../executives/briefingExport.js'
const source={accounts:[{id:'op',name:'Operating',type:'checking',balance:500,plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking'}],budgetLegacyAccountId:'op',transactionFreshnessStatus:'cached',actuals:[{id:'mapped',date:'2026-11-10',accountId:'bank',amount:10,category:'Food'},{id:'unknown',date:'2026-11-11',accountId:'unlinked',name:'=IMPORTXML("bad")',amount:20,pending:true},{id:'old',date:'2026-10-11',accountId:'unlinked',amount:30},{id:'deleted',date:'2026-11-12',accountId:'unlinked',amount:40,_deleted:true}],scheduled:[],budget:{}}
test('one source load preserves exact excluded rows and separates unknown ownership from ledger scope',async()=>{
 let loads=0;const canonical={access:{finance:true},householdDate:'2026-11-19',sources:[],actionRecords:{finance:{forecasts:{workScenarioTemplates:[{invented:true}],scenarios:[{title:'Saved hypothetical'}]}}}}
 const evidence=await loadExecutiveFinancialEvidence(canonical,{load:async()=>{loads++;return source},now:new Date('2026-11-19T17:00:00Z')})
 assert.equal(loads,1);assert.equal(evidence.unmapped.count,1);assert.equal(evidence.unmapped.rows[0].id,'unknown');assert.equal(evidence.unmapped.rows[0].status,'pending');assert.equal(evidence.unmapped.rows[0].ownership,'unknown')
 assert.equal(evidence.ledger.totals.reportedExpenses,10);assert.equal(evidence.ledger.rows,undefined)
 assert.equal(evidence.savedScenarios.workScenarioTemplates,undefined)
 assert.equal(executiveFinancialModelContext(evidence).E5.rows,undefined)
 assert.equal(evidence.planning.state,'available');assert.deepEqual(evidence.planning.horizons.map(x=>x.days),[30,60,90])
 assert.match(evidenceCSV(evidence),/"'=IMPORTXML/)
 await assert.rejects(loadExecutiveFinancialEvidence({...canonical,access:{finance:false}},{load:async()=>{throw Error('must not read')}}),/access required/)
})
const brief={assessment:'Preserve cash resilience',changes:'No comparable prior briefing',priorities:[{decision:'Choose a planning reserve',whyNow:'Upcoming commitments',recommendation:'Review coverage',alternative:'Delay review',tradeoff:'Time versus uncertainty',impact:'Not quantified',owner:'Larry, proposed',milestone:'Review at the next meeting',evidenceRefs:['E3']}],outlook:['30 days','60 days','90 days'].map(horizon=>({horizon,pressure:'Unknown receipts',opportunity:'Review plans',trigger:'Updated source evidence',evidenceRefs:['E3']})),wealthAndProtection:'Tax inputs unavailable',discussionQuestions:['What reserve is appropriate?'],limitations:['Saved evidence only']}
test('strategic output requires decisions and all three horizons; meeting export escapes source text',()=>{
 assert.deepEqual(validateStrategicBrief(brief),brief)
 assert.throws(()=>validateStrategicBrief({...brief,priorities:[]}))
 assert.throws(()=>validateStrategicBrief({...brief,outlook:brief.outlook.slice(0,2)}))
 const html=briefingHTML({id:'test',createdAt:'2026-11-19',stages:[{role:'bruce',result:{strategicBrief:{...brief,assessment:'<script>alert(1)</script>'}}}]})
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/30 \/ 60 \/ 90/)
})

test('material later-horizon obligations remain in model evidence beyond the chronological detail cap',()=>{
 const payables=Array.from({length:25},(_,i)=>({title:i===24?'Large annual obligation':i===0?'__proto__':'Small recurring bill',amount:i===24?30000:10,date:'2027-01-01'}))
 const evidence={planning:{payables,projectedInflows:[]},savedScenarios:{},ledger:{},accounts:{},unmapped:{rows:[]}}
 const model=executiveFinancialModelContext(evidence)
 assert.equal(model.E3.payables.length,20)
 assert.equal(model.E3.largestPayables[0].title,'Large annual obligation')
 assert.deepEqual(model.E3.obligationGroups[0],{title:'Large annual obligation',scheduledAmount:30000,occurrences:1})
 assert.equal(model.E3.obligationGroups[1].scheduledAmount,230)
 assert.equal(model.E3.obligationGroups.find(x=>x.title==='__proto__').scheduledAmount,10)
 assert.equal(payables[0].amount,10)
})

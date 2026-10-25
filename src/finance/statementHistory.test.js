import test from 'node:test'
import assert from 'node:assert/strict'
import {parseStatementCsv,mergeStatementHistory} from './statementHistory.js'
import {normalizeActionOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
const accounts=[{id:'a',plaidAccountId:'bank'}],text='date,description,amount,category\n2025-01-01,"Store, Inc",20,Food\n2025-01-02,Salary,-1000,Income'
test('statement import parses quoted CSV, signed amounts and stable IDs; overlap and future dates fail closed',()=>{
 const rows=parseStatementCsv(text,{accountId:'a',today:'2026-10-25',bankRows:[{date:'2026-01-01'}]})
 assert.equal(rows[0].name,'Store, Inc');assert.equal(rows[1].amount,-1000)
 assert.deepEqual(rows,parseStatementCsv(text,{accountId:'a',today:'2026-10-25'}))
 assert.throws(()=>parseStatementCsv(text,{accountId:'a',today:'2024-01-01'}),/valid past/)
 assert.throws(()=>parseStatementCsv(text,{accountId:'a',today:'2026-10-25',bankRows:[{date:'2025-01-02'}]}),/overlaps/)
})
test('reviewed statement import retains originals and repeats are idempotent; newer bank coverage excludes overlap',()=>{
 const rows=parseStatementCsv(text,{accountId:'a',today:'2026-10-25'})
 const op=normalizeActionOperation({type:'finance.statement.import',targetId:'a',payload:{configJson:JSON.stringify(rows)}})
 const context={actor:'Larry',now:()=>new Date('2026-10-25T21:00:00Z')}
 const saved=applyRecordOperation({accounts,transactions:[]},op,undefined,context).after
 assert.equal(applyRecordOperation(saved,op,undefined,context).after.statementTransactions.length,2)
 const overlapping=normalizeActionOperation({type:'finance.statement.import',targetId:'a',payload:{configJson:JSON.stringify(rows.map(row=>({...row,id:row.id+'other'})))}})
 assert.throws(()=>applyRecordOperation(saved,overlapping,undefined,context),/overlaps previously imported/)
 const bank=[{id:'posted',date:'2025-01-02',amount:-1000,accountId:'bank'}]
 const merged=mergeStatementHistory(bank,saved.statementTransactions,accounts)
 assert.equal(merged.length,2);assert.equal(merged.filter(t=>t.source==='statement').length,1)
 assert.equal(saved.statementTransactions.length,2)
})

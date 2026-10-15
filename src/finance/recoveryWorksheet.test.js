import test from 'node:test'
import assert from 'node:assert/strict'
import {createRecoveryWorksheet,projectWorksheet,validateWorksheet} from './recoveryWorksheet.js'
import {RECOVERY_DEFAULT,validateRecovery} from './recoveryScenario.js'
test('source worksheet reproduces every supplied running balance in integer cents',()=>{
 const result=projectWorksheet(createRecoveryWorksheet())
 assert.equal(result.opening,17000)
 assert.deepEqual(result.rows.map(r=>r.balance),[9000,13000,17000,23604.09,30208.18,36812.27,43416.36,13078.77,19682.86,26286.95,32891.04,39495.13,46099.22,52703.31,59307.40,65911.49,72515.58,42177.99,26177.99,32782.08,39386.17])
 assert.equal(result.obligations,76675.18)
 assert.equal(result.rows.at(-1).month,'2027-12')
 assert.match(createRecoveryWorksheet().sourceNotes,/labeled 2028/)
 assert.ok(result.rows.every(r=>r.classification==='hypothetical'))
})
test('worksheet edits recompute without mutating source or operational data',()=>{
 const input=createRecoveryWorksheet(),before=JSON.stringify(input)
 projectWorksheet(input);assert.equal(JSON.stringify(input),before)
 const edited=structuredClone(input);edited.rows[0].amount=0
 assert.equal(projectWorksheet(edited).closing,30386.17)
 edited.rows[0].amount=-100000;assert.equal(projectWorksheet(edited).negative,true)
 assert.equal(validateRecovery({...RECOVERY_DEFAULT,worksheet:input}).worksheet.rows.length,21)
 assert.equal(Object.hasOwn(validateRecovery(RECOVERY_DEFAULT),'worksheet'),false)
})
test('worksheet rejects duplicate IDs, malformed months and invalid numeric values',()=>{
 for(const change of [w=>w.rows[1].id=w.rows[0].id,w=>w.rows[3].month='2026-13',w=>w.rows[5].month='2025-01',w=>w.rows[0].amount=NaN,w=>w.rows[0].actual=true]){
 const w=createRecoveryWorksheet();change(w);assert.throws(()=>validateWorksheet(w))
 }
})

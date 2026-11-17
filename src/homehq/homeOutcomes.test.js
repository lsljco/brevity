import test from 'node:test'
import assert from 'node:assert/strict'
import {homeOutcomes} from './homeOutcomes.js'
const date='2026-11-17'
const plan=()=>({date,topPriorities:[{id:'terica',title:'Welcome Weekend Warrior',owner:'Terica'},{id:'lorenzo',title:'Content creation',owner:'Lorenzo'}],household:{},assignments:Array.from({length:8},(_,i)=>({id:`task-${i}`,title:`Larry outcome ${i+1}`,owner:'Larry',date,priority:i<4?'high':'normal',status:'pending'}))})
test('Home shows all eight Action Mode assignments alongside household outcomes',()=>{
 const source=plan(),before=structuredClone(source)
 assert.equal(homeOutcomes(source,'Larry','household').length,10)
 assert.deepEqual(homeOutcomes(source,'Larry','mine').map(row=>row.id),source.assignments.map(row=>row.id))
 assert.deepEqual(source,before)
})
test('Home excludes other dates and cancellations while keeping completed tasks visible',()=>{
 const source=plan()
 source.assignments[0].date='2026-11-18'
 source.assignments[1].status='cancelled'
 source.assignments[2].cancelled=true
 source.assignments[3].status='complete'
 const rows=homeOutcomes(source,'Larry','mine')
 assert.equal(rows.length,5)
 assert.equal(rows[0].id,'task-3')
 assert.equal(rows[0].status,'complete')
})
test('Home deduplicates shared IDs but retains distinct records with similar titles',()=>{
 const source=plan()
 source.topPriorities=[{...source.assignments[0]},{...source.assignments[1],id:'different'}]
 assert.equal(homeOutcomes(source,'Larry','mine').length,9)
 assert.equal(homeOutcomes(source,'Larry','mine').filter(row=>row.id==='task-0').length,1)
})

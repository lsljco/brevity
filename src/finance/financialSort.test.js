import test from 'node:test'
import assert from 'node:assert/strict'
import {compareFinancialValues,sortFinancialSections} from './financialSort.js'
test('sorts currency numerically, including signed cash movements and percentages',()=>{
 assert.deepEqual(['$1,000.00','$20.00','$9.00'].sort(compareFinancialValues),['$9.00','$20.00','$1,000.00'])
 assert.ok(compareFinancialValues('-$300','-$20')<0)
 assert.ok(compareFinancialValues('75%','100%')<0)
 assert.ok(compareFinancialValues('($1,000)','$20')<0)
})
test('dates sort chronologically and missing values remain last in both directions',()=>{
 assert.ok(compareFinancialValues('Nov 30, 2026','Dec 1, 2026')<0)
 assert.ok(compareFinancialValues('2026-11-14','2026-11-02','desc')<0)
 for(const direction of ['asc','desc'])assert.ok(compareFinancialValues('Unavailable','$20',direction)>0)
})
test('section sorting retains totals and milestones, ties are stable and input is unchanged',()=>{
 const rows=[{v:3},{v:1,id:'a'},{v:1,id:'b'},{v:4,pin:true},{v:9},{v:2},{v:11,pin:true}]
 const result=sortFinancialSections(rows,r=>r.v,r=>r.pin,'asc')
 assert.deepEqual(result.map(r=>r.v),[1,1,3,4,2,9,11]);assert.equal(result[0].id,'a');assert.equal(result[1].id,'b');assert.equal(rows[0].v,3)
})

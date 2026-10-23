import test from 'node:test'
import assert from 'node:assert/strict'
import { shiftPlanDate, validPlanDate } from './planDateNavigation.js'

test('daily navigation crosses month, year and DST boundaries without changing local day',()=>{
  assert.equal(shiftPlanDate('2026-11-01',-1),'2026-10-31')
  assert.equal(shiftPlanDate('2026-12-31',1),'2027-01-01')
  assert.equal(shiftPlanDate('2028-03-01',-1),'2028-02-29')
})
test('invalid or incomplete date inputs cannot select a different plan',()=>{
  for (const input of ['',undefined,'2026-02-29','2026-13-01','2026-1-2']) assert.equal(validPlanDate(input),false)
  assert.equal(validPlanDate('2028-02-29'),true)
  assert.throws(()=>shiftPlanDate('invalid',1),/valid daily plan date/)
})

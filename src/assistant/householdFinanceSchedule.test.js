import test from 'node:test'
import assert from 'node:assert/strict'
import {householdFinanceSchedule} from '../../netlify/lib/household-finance-schedule.mjs'
const tx=(id,type,amount,start,freq='once')=>({id,name:id,type,amount,start,freq})
test('scheduled briefing respects recurrence, skips, one-time items, month boundary and transfers',()=>{
 const result=householdFinanceSchedule({transactions:[tx('Bill','expense',80,'2026-09-30','monthly'),tx('Salary','income',500,'2026-10-01'),tx('Transfer','transfer',900,'2026-10-01'),{...tx('Skipped','expense',70,'2026-09-30','monthly'),skips:['2026-09-30']},tx('Later','expense',300,'2026-10-06'),tx('Today','expense',20,'2026-09-29')]},'2026-09-29')
 assert.equal(result.through,'2026-10-05');assert.deepEqual(result.items.map(i=>i.title),['Today','Bill','Salary'])
 assert.deepEqual(result.today.expenses,{count:1,amount:20});assert.deepEqual(result.sevenDays.expenses,{count:2,amount:100});assert.equal(result.sevenDays.income.amount,500)
 assert.ok(result.items.every(i=>i.status==='scheduled-unconfirmed'));assert.match(result.notice,/not proof of payment/)
})
test('missing and unavailable finance sources cannot report zero obligations',()=>{
 for(const state of ['missing','unavailable']){const r=householdFinanceSchedule(null,'2026-09-29',{state});assert.equal(r.state,state);assert.equal(r.sevenDays,undefined)}
 assert.equal(householdFinanceSchedule({},'2026-09-29').state,'unavailable')
 assert.equal(householdFinanceSchedule({transactions:[]},'2026-09-29').sevenDays.expenses.count,0)
})
test('totals retain all records beyond display and authoritative context array limits',()=>{
 const transactions=Array.from({length:310},(_,i)=>tx(`Bill ${i}`,'expense',1,'2026-09-30'))
 const r=householdFinanceSchedule({transactions},'2026-09-29')
 assert.equal(r.items.length,40);assert.equal(r.omittedCount,270);assert.equal(r.sevenDays.expenses.amount,310)
})

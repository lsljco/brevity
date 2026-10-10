import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const {appendBalanceSnapshot}=createRequire(import.meta.url)('../../netlify/lib/finance-balance-history.cjs')
test('source history retains one dated observation per household day without inventing a closing balance',()=>{
 const accounts=[{plaidAccountId:'bank',plaidCurrentBalance:4600},{id:'manual',balance:200}]
 let rows=appendBalanceSnapshot([],accounts,Date.parse('2026-10-09T01:00:00Z'))
 assert.equal(rows[0].date,'2026-10-08')
 assert.equal(rows[0].kind,'intraday')
 assert.deepEqual(rows[0].balances,{bank:4600})
 rows=appendBalanceSnapshot(rows,[{...accounts[0],plaidCurrentBalance:3225}],Date.parse('2026-10-09T02:00:00Z'))
 assert.equal(rows.length,1)
 assert.equal(rows[0].balances.bank,3225)
 rows=appendBalanceSnapshot(rows,accounts,Date.parse('2026-10-09T12:00:00Z'))
 assert.equal(rows.length,2)
})
test('source observations older than the rolling window expire',()=>{
 const rows=appendBalanceSnapshot([{date:'2024-01-01',capturedAt:'2024-01-01T12:00:00Z',balances:{bank:1}}],[],Date.parse('2026-10-09T12:00:00Z'))
 assert.equal(rows.length,1)
})

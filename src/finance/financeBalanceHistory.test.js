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
test('source observations remain available beyond the display window',()=>{
 const rows=appendBalanceSnapshot([{date:'2024-01-01',capturedAt:'2024-01-01T12:00:00Z',balances:{bank:1}}],[],Date.parse('2026-10-09T12:00:00Z'))
 assert.equal(rows.length,1)
})

test('a partial same-day refresh retains other accounts and their original source times',()=>{
 const first=appendBalanceSnapshot([],[{plaidAccountId:'a',plaidCurrentBalance:100},{plaidAccountId:'b',plaidCurrentBalance:200}],Date.parse('2026-10-20T12:00:00Z'))
 const rows=appendBalanceSnapshot(first,[{plaidAccountId:'a',plaidCurrentBalance:50}],Date.parse('2026-10-20T16:00:00Z'))
 assert.deepEqual(rows[0].balances,{a:50,b:200})
 assert.equal(rows[0].accountCapturedAt.b,'2026-10-20T12:00:00.000Z')
 assert.equal(rows[0].accountCapturedAt.a,'2026-10-20T16:00:00.000Z')
 assert.deepEqual(appendBalanceSnapshot(rows,[],Date.parse('2026-10-21T16:00:00Z')),rows)
})

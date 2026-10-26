import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const {appendBalanceSnapshot}=createRequire(import.meta.url)('../../netlify/lib/finance-balance-history.cjs')
const {appendTransactionBalanceSnapshots}=createRequire(import.meta.url)('../../netlify/lib/finance-balance-history.cjs')

test('paired balances reconcile posted deltas, preserve discrepancies and ignore pending holds',()=>{
 const batch=(id,current,status='HISTORICAL_UPDATE_COMPLETE')=>({pendingDelta:{batchId:id,createdAt:'2026-10-25T16:00:00Z',updateStatus:status,balanceAccounts:[{accountId:'bank',current,available:current-50}]}})
 const tx=(id,amount,pending=false)=>({id,accountId:'bank',amount,pending})
 let rows=appendTransactionBalanceSnapshots([],[batch('one',1000)],[tx('deposit',-1000)])
 assert.equal(rows[0].reconciliation.bank.status,'baseline')
 rows=appendTransactionBalanceSnapshots(rows,[batch('two',900)],[tx('deposit',-1000),tx('spent',100),tx('hold',50,true)])
 assert.equal(rows[1].reconciliation.bank.status,'matched')
 assert.equal(rows[1].postedTotals.bank,90000)
 rows=appendTransactionBalanceSnapshots(rows,[batch('three',800)],[tx('deposit',-1000),tx('spent',100)])
 assert.equal(rows[2].reconciliation.bank.difference,-100)
 assert.deepEqual(appendTransactionBalanceSnapshots(rows,[batch('three',800)],[tx('deposit',-1000)]),rows)
 rows=appendTransactionBalanceSnapshots(rows,[batch('four',800)],[tx('deposit',-1000),tx('spent',100)])
 assert.equal(rows[3].reconciliation.bank.status,'matched')
 assert.equal(rows[2].reconciliation.bank.status,'difference')
 assert.equal(appendTransactionBalanceSnapshots([],[batch('loading',800,'INITIAL_UPDATE_COMPLETE')],[])[0].reconciliation.bank.status,'history-loading')
})

test('modified and removed posted rows reconcile against the previously retained ledger total',()=>{
 const batch=(id,current)=>({pendingDelta:{batchId:id,createdAt:'2026-10-25T16:00:00Z',updateStatus:'HISTORICAL_UPDATE_COMPLETE',balanceAccounts:[{accountId:'bank',current}]}})
 const row=amount=>({id:'charge',accountId:'bank',amount,pending:false})
 let history=appendTransactionBalanceSnapshots([],[batch('one',900)],[row(100)])
 history=appendTransactionBalanceSnapshots(history,[batch('two',880)],[row(120)])
 assert.equal(history[1].reconciliation.bank.difference,0)
 history=appendTransactionBalanceSnapshots(history,[batch('three',1000)],[])
 assert.equal(history[2].reconciliation.bank.difference,0)
})
test('source history retains every timestamped observation without inventing a closing balance',()=>{
 const accounts=[{plaidAccountId:'bank',plaidCurrentBalance:4600},{id:'manual',balance:200}]
 let rows=appendBalanceSnapshot([],accounts,Date.parse('2026-10-09T01:00:00Z'))
 assert.equal(rows[0].date,'2026-10-08')
 assert.equal(rows[0].kind,'intraday')
 assert.deepEqual(rows[0].balances,{bank:4600})
 rows=appendBalanceSnapshot(rows,[{...accounts[0],plaidCurrentBalance:3225}],Date.parse('2026-10-09T02:00:00Z'))
 assert.equal(rows.length,2)
 assert.equal(rows[1].balances.bank,3225)
 rows=appendBalanceSnapshot(rows,accounts,Date.parse('2026-10-09T12:00:00Z'))
 assert.equal(rows.length,3)
})
test('source observations remain available beyond the display window',()=>{
 const rows=appendBalanceSnapshot([{date:'2024-01-01',capturedAt:'2024-01-01T12:00:00Z',balances:{bank:1}}],[],Date.parse('2026-10-09T12:00:00Z'))
 assert.equal(rows.length,1)
})

test('a partial same-day refresh retains other accounts and their original source times',()=>{
 const first=appendBalanceSnapshot([],[{plaidAccountId:'a',plaidCurrentBalance:100},{plaidAccountId:'b',plaidCurrentBalance:200}],Date.parse('2026-10-20T12:00:00Z'))
 const rows=appendBalanceSnapshot(first,[{plaidAccountId:'a',plaidCurrentBalance:50}],Date.parse('2026-10-20T16:00:00Z'))
 assert.deepEqual(rows[0].balances,{a:100,b:200})
 assert.deepEqual(rows[1].balances,{a:50})
 assert.equal(rows[0].accountCapturedAt.b,'2026-10-20T12:00:00.000Z')
 assert.equal(rows[1].accountCapturedAt.a,'2026-10-20T16:00:00.000Z')
 assert.deepEqual(appendBalanceSnapshot(rows,[],Date.parse('2026-10-21T16:00:00Z')),rows)
})

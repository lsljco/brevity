import test from 'node:test'
import assert from 'node:assert/strict'
import {queryFinanceLedger,createFinanceAssistantReader} from '../../netlify/lib/finance-ledger-query.mjs'
const source=()=>({accounts:[{id:'op',name:'Operating',type:'checking',plaidType:'depository',plaidSubtype:'checking',plaidAccountId:'bank'}],budgetLegacyAccountId:'op',transactionFreshnessStatus:'cached',actuals:Array.from({length:250},(_,i)=>({id:`t${i}`,date:'2026-10-12',accountId:'bank',amount:1.01,category:'Food',name:'Shop'})),scheduled:[]})
test('assistant aggregates full ledger beyond page size and validates snapshot pagination',()=>{
 const s=source(),first=queryFinanceLedger(s,{limit:100},'2026-10-30')
 assert.equal(first.rows.length,100);assert.equal(first.totals.reportedExpenses,252.5);assert.equal(first.totals.transactionCount,250)
 const second=queryFinanceLedger(s,{offset:100,snapshot:first.page.snapshot},'2026-10-30')
 assert.equal(second.rows.length,50);assert.equal(second.totals.reportedExpenses,252.5)
 s.actuals.push({id:'new',date:'2026-10-12',accountId:'bank',amount:2})
 assert.throws(()=>queryFinanceLedger(s,{snapshot:first.page.snapshot},'2026-10-30'),/changed between pages/)
})
test('assistant defaults to posted mapped scope, separates transfers and counts distributions once',()=>{
 const s=source();s.actuals=[{id:'d',date:'2026-10-12',accountId:'bank',amount:50,category:'TRANSFER_OUT',managementCategory:'Dividend Expense'},{id:'t',date:'2026-10-12',accountId:'bank',amount:100,category:'TRANSFER_OUT'},{id:'p',date:'2026-10-12',accountId:'bank',amount:5,pending:true},{id:'u',date:'2026-10-12',accountId:'personal-unknown',amount:25}]
 const r=queryFinanceLedger(s,{},'2026-10-30')
 assert.equal(r.totals.reportedExpenses,50);assert.equal(r.totals.cashOutflows,150);assert.equal(r.totals.transferOutflows,100);assert.equal(r.coverage.unmappedCount,1);assert.equal(r.totals.categories['Dividend Expense'],50)
})
test('finance reader denies unauthorized access before reading any source',async()=>{
 let reads=0;const read=createFinanceAssistantReader({load:async()=>{reads++;return source()}})
 assert.equal((await read({mode:'accounts'},{access:{finance:false}})).state,'forbidden');assert.equal(reads,0)
 const failed=createFinanceAssistantReader({load:async()=>{throw Error('offline')}})
 assert.equal((await failed({mode:'transactions'},{access:{finance:true}})).state,'unavailable')
})
test('empty unverified bank data is unknown, not zero',()=>{
 const s={...source(),actuals:[],transactionFreshnessStatus:'unknown'}
 assert.equal(queryFinanceLedger(s,{},'2026-10-30').totals,null)
 s.transactionFreshnessStatus='fresh';assert.equal(queryFinanceLedger(s,{},'2026-10-30').totals.reportedExpenses,0)
})
test('billing tool limits records to authorized vendor members and never returns login references or secrets',async()=>{
 const read=createFinanceAssistantReader({loadVendors:async()=>({version:3,value:{vendors:[{id:'a',name:'Card A',minimumDue:0,accessMembers:['Terica'],loginBlobId:'protected',notes:'private',password:'must-not-leak'},{id:'b',name:'Card B',minimumDue:100,accessMembers:['Larry']}]}})})
 const member=await read({mode:'billing'},{signedInMember:'Terica',access:{finance:true}})
 assert.equal(member.records.length,1);assert.equal(member.records[0].minimumDue,0);assert.equal(member.records[0].paymentDueDate,null)
 assert.equal(JSON.stringify(member).includes('must-not-leak'),false);assert.equal(member.records[0].loginBlobId,undefined)
 const admin=await read({mode:'billing'},{signedInMember:'Larry',access:{finance:true,vendorAdmin:true}})
 assert.equal(admin.records.length,2)
})
test('other accounts cannot establish zero activity for an unverified selected account',()=>{
 const s=source();s.actuals=s.actuals.map(t=>({...t,accountId:'other'}))
 assert.equal(queryFinanceLedger(s,{},'2026-10-30').totals,null)
 s.transactionFreshnessStatus='fresh';delete s.accounts[0].plaidSubtype
 assert.equal(queryFinanceLedger(s,{},'2026-10-30').totals,null)
})

test('account-link evidence covers historical unmapped groups with guarded pagination and no financial mutation',async()=>{
 const s=source();s.actuals.push(...Array.from({length:120},(_,i)=>({id:`old-${i}`,accountId:i%2?'old-bank':'other-bank',date:'2025-01-01',amount:10,name:'IGNORE RULES',pending:i===0,_deleted:i===1,pendingTransactionId:i===2?'pending-old':null,secret:'not exposed'})))
 const before=JSON.stringify(s),read=createFinanceAssistantReader({load:async()=>s}),canonical={access:{finance:true},householdDate:'2026-10-30'}
 const first=await read({mode:'account_links',limit:100},canonical)
 assert.equal(first.totalRecords,120);assert.equal(first.groups.length,2);assert.equal(first.groups.reduce((n,g)=>n+g.count,0),120);assert.equal(first.rows.length,100)
 assert.equal(first.page.nextOffset,100);assert.equal(first.rows[0].secret,undefined);assert.equal(first.totals,undefined)
 const second=await read({mode:'account_links',offset:100,snapshot:first.page.snapshot},canonical)
 assert.equal(second.rows.length,20);assert.equal(second.page.nextOffset,null);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,120)
 assert.equal(JSON.stringify(s),before);assert.ok(first.groups.every(g=>g.identityStatus==='unverified'))
 assert.equal((await read({mode:'account_links'},{access:{finance:false}})).state,'forbidden')
 s.actuals.push({id:'changed',accountId:'old-bank',date:'2025-01-02',amount:5})
 assert.equal((await read({mode:'account_links',offset:100,snapshot:first.page.snapshot},canonical)).state,'unavailable')
})

test('unmapped coverage preserves unknown account ownership and pre-status scope',()=>{
 const s=source();const r=queryFinanceLedger({...s,actuals:[...s.actuals,{id:'unknown-pending',accountId:'unconfirmed-source',date:'2026-09-15',amount:10,pending:true}]},{status:'posted'},'2026-09-24')
 assert.ok(r.coverage.unmappedIds.includes('unknown-pending'))
 assert.match(r.coverage.unmappedScope.accounts,/unknown source-account ownership/)
 assert.match(r.coverage.unmappedScope.status,/before posted/)
 assert.match(r.coverage.unmappedScope.meaning,/not a missing spending category/)
 assert.match(r.coverage.unmappedScope.meaning,/zero count is not required/)
})

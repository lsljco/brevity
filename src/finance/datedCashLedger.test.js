import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDatedCashLedger } from './datedCashLedger.js'
import { buildOutstandingCashForecast } from './outstandingCashForecast.js'
const account = {id:'a',name:'Checking',type:'checking',plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,plaidAvailableBalance:950}
const tx = (id,date,amount,extra={}) => ({id,date,amount,accountId:'bank',...extra})
const snapshot = (date,amount) => ({date,capturedAt:`${date}T16:00:00Z`,kind:'intraday',balances:{bank:amount}})
const build = extra => buildDatedCashLedger({accounts:[account],today:'2026-10-25',...extra})

test('paired sync reconstructs posting-day closes without moving them to the retrieval day',()=>{
 // Synthetic reproduction: a large Friday inflow downloaded Saturday must
 // neither disappear Friday nor be subtracted twice from earlier history.
 const transactions=[tx('expense','2026-10-08',100),tx('pay','2026-10-09',-4000),tx('later','2026-10-13',3000)]
 const paired={kind:'transaction-sync',historyComplete:true,date:'2026-10-14',capturedAt:'2026-10-14T12:00:00Z',balances:{bank:1200},postedTotals:{bank:90000}}
 const result=build({transactions,balanceHistory:[snapshot('2026-10-09',200),paired]})
 assert.equal(result.balances['2026-10-08'],200)
 assert.equal(result.balances['2026-10-09'],4200)
 assert.equal(result.balances['2026-10-10'],4200)
 assert.equal(result.balances['2026-10-13'],1200)
 assert.equal(result.balances['2026-10-14'],1200)
 assert.equal(result.forecastAccounts[0],account)
 const corrected=build({transactions,balanceHistory:[paired],closingRecords:{a:{'2026-10-09':{source:'user-recorded',amount:4300}}}})
 assert.equal(corrected.balances['2026-10-09'],4300)
 assert.equal(corrected.balances['2026-10-13'],1300)
 assert.equal(corrected.forecastAccounts[0],account)
 const extended=build({transactions:[...transactions,tx('statement','2026-10-07',200,{source:'statement'})],balanceHistory:[paired]})
 assert.equal(extended.balances['2026-10-08'],200)
 assert.equal(extended.balances['2026-10-13'],1200)
})

test('incomplete paired history is not treated as a daily close',()=>{
 const result=build({transactions:[tx('one','2026-10-01',100)],balanceHistory:[{kind:'transaction-sync',historyComplete:false,date:'2026-10-24',capturedAt:'2026-10-24T12:00:00Z',balances:{bank:1000},postedTotals:{bank:-10000}}]})
 assert.deepEqual(result.balances,{})
})

test('dated stale bank anchor reconstructs both directions using posted cash movements, not today’s date',()=>{
 const result=build({balanceHistory:[snapshot('2026-10-20',1000)],transactions:[tx('old','2026-10-18',30),tx('anchor','2026-10-20',100),tx('later','2026-10-22',200),tx('pending','2026-10-23',50,{pending:true})]})
 assert.equal(result.balances['2026-10-19'],1100)
 assert.equal(result.balances['2026-10-20'],1000)
 assert.equal(result.balances['2026-10-21'],1000)
 assert.equal(result.balances['2026-10-24'],800)
 assert.equal(result.forecastAccounts[0].plaidCurrentBalance,800)
 assert.equal(result.forecastAccounts[0].plaidAvailableBalance,undefined)
 assert.equal(account.plaidCurrentBalance,1000)
 const forecast=buildOutstandingCashForecast(result.forecastAccounts,[],[tx('pending','2026-10-23',50,{pending:true})],{today:'2026-10-25',reconcile:true})
 assert.equal(forecast.get('2026-10-25').bal,750)
})

test('today’s bank available balance retains holds without applying pending twice',()=>{
 const result=build({balanceHistory:[snapshot('2026-10-25',1000)],transactions:[tx('old','2026-10-20',100),tx('pending','2026-10-25',50,{pending:true})]})
 assert.equal(result.forecastAccounts[0].plaidAvailableBalance,950)
 assert.equal(buildOutstandingCashForecast(result.forecastAccounts,[],[tx('pending','2026-10-25',50,{pending:true})],{today:'2026-10-25',reconcile:true}).get('2026-10-25').bal,950)
})

test('recorded zero and negative closes anchor later estimates until a newer bank observation',()=>{
 const result=build({balanceHistory:[snapshot('2026-10-20',1000),snapshot('2026-10-24',400)],closingRecords:{a:{'2026-10-21':{source:'user-recorded',amount:0}}},transactions:[tx('prior','2026-10-18',10),tx('later','2026-10-22',25)]})
 assert.equal(result.balances['2026-10-21'],0)
 assert.equal(result.balances['2026-10-22'],-25)
 assert.equal(result.balances['2026-10-23'],-25)
 assert.equal(result.balances['2026-10-24'],400)
 assert.equal(result.forecastAccounts[0].plaidCurrentBalance,400)
})

test('accounts use their own dated anchors and internal transfers cancel; duplicate IDs and pending do not inflate history',()=>{
 const other={...account,id:'b',plaidAccountId:'bank2',name:'Savings',type:'savings',plaidSubtype:'savings'}
 const rows=[tx('out','2026-10-22',100),tx('in','2026-10-22',-100,{accountId:'bank2'}),tx('out','2026-10-22',100)]
 const result=build({accounts:[account,other],balanceHistory:[snapshot('2026-10-20',1000),{date:'2026-10-21',balances:{bank2:500}}],transactions:rows})
 assert.equal(result.balances['2026-10-24'],1500)
 assert.equal(result.forecastAccounts[0].plaidCurrentBalance,900)
 assert.equal(result.forecastAccounts[1].plaidCurrentBalance,600)
})

test('missing anchors stay explicit; legacy success dates recover history without fabricating a current date',()=>{
 const transactions=[tx('old','2026-10-18',20),tx('new','2026-10-22',100)]
 assert.deepEqual(build({transactions}).balances,{})
 assert.equal(build({transactions,legacyAnchorDate:'2026-10-20'}).balances['2026-10-24'],900)
 assert.deepEqual(build({transactions,legacyAnchorDate:'2026-13-20'}).balances,{})
 assert.deepEqual(build({transactions,accounts:[{...account,plaidType:'credit'}],legacyAnchorDate:'2026-10-20'}).balances,{})
})

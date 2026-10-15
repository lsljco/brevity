import test from 'node:test'
import assert from 'node:assert/strict'
import {RECOVERY_DEFAULT,validateRecovery,biweeklyDates,projectRecovery} from './recoveryScenario.js'
import {buildOutstandingCashForecast} from './outstandingCashForecast.js'
const assumptions=patch=>({...RECOVERY_DEFAULT,firstPayDate:'2026-11-06',...patch})
const source=(opening=0)=>({forecast:new Map([['2026-10-31',{bal:opening}]])})
test('confirmed expected and conservative monthly surpluses use exact cents',()=>{
  const expected=projectRecovery(assumptions(),source()).months[0]
  const conservative=projectRecovery(assumptions(),source(),'conservative').months[0]
  assert.equal(expected.closing,14104.09)
  assert.equal(conservative.closing,13606)
  assert.equal(projectRecovery(assumptions(),source(),'baseline').months[0].closing,6604.09)
})
test('biweekly dates use 14 calendar days across year and DST boundaries',()=>{
  const dates=biweeklyDates('2026-01-02','2026-01-01','2026-12-31')
  assert.equal(dates.length,26)
  for(let i=1;i<dates.length;i++)assert.equal(Date.parse(dates[i])-Date.parse(dates[i-1]),14*86400000)
  assert.equal(biweeklyDates('2026-01-02','2027-01-01','2027-12-31').length,27)
  assert.deepEqual(biweeklyDates('','2026-01-01','2026-12-31'),[])
})
test('optimistic retains third checks; expected caps them without changing pay dates',()=>{
  const a=assumptions({firstPayDate:'2026-11-01'})
  assert.equal(projectRecovery(a,source(),'optimistic').months[0].payroll,22500)
  assert.equal(projectRecovery(a,source()).months[0].payroll,15000)
})
test('unknown and delayed payroll do not manufacture income',()=>{
  assert.equal(projectRecovery(assumptions({firstPayDate:''}),source()).months[0].payroll,0)
  const late=projectRecovery(assumptions({firstPayDate:'2026-12-18'}),source())
  assert.equal(late.months[0].payroll,0)
  assert.equal(late.months[1].payroll,7500)
})
test('property tax occurs once on supplied date and negative cash remains visible',()=>{
  const p=projectRecovery(assumptions({taxDate:'2026-11-02',extraDebt:20000}),source(1000))
  assert.equal(p.daily.find(d=>d.date==='2026-11-02').tax,30000)
  assert.equal(p.months.reduce((s,m)=>s+m.tax,0),30000)
  assert.ok(p.daily.find(d=>d.date==='2026-11-02').balance<0)
  assert.equal(p.months[0].extraDebt,0)
  assert.equal(projectRecovery(assumptions({taxDate:''}),source()).months[0].tax,0)
})
test('live forecast handles pending bank holds once and never receives hypothetical records',()=>{
  const accounts=[{id:'a1',type:'checking',balance:1000,plaidAccountId:'p1',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000,plaidAvailableBalance:900}]
  const transactions=[{id:'tax',type:'expense',acct:'a1',name:'Property tax',amount:30000,freq:'once',start:'2026-11-10'}]
  const actuals=[{id:'pending',accountId:'p1',date:'2026-10-30',amount:100,pending:true,name:'Hold'}]
  const before=JSON.stringify({accounts,transactions,actuals})
  const forecast=buildOutstandingCashForecast(accounts,transactions,actuals,{today:'2026-10-31',days:70,pastDays:0})
  const frozen=JSON.stringify([...forecast])
  const p=projectRecovery(assumptions({baselineMode:'live',end:'2026-11-30',taxDate:'2026-11-10',taxRecordId:'tax'}),{forecast})
  assert.equal(p.opening,900)
  assert.equal(p.months[0].tax,0)
  assert.equal(p.months[0].baseline,-30000)
  assert.equal(p.months[0].closing,-21600)
  assert.equal(JSON.stringify([...forecast]),frozen)
  assert.equal(JSON.stringify({accounts,transactions,actuals}),before)
})
test('debt extra payments respect reserve and do not charge minimums twice',()=>{
  const debts=[{id:'loan',creditor:'Loan',status:'Active',currentBalance:10000,minimumPayment:100,interestRate:12}]
  const p=projectRecovery(assumptions({extraDebt:5000,reserve:12000}),{...source(),debts})
  assert.equal(p.months[0].extraDebt,2104.09)
  assert.equal(p.months[0].closing,12000)
  assert.equal(p.months[0].debtBalance,7895.91)
  assert.ok(p.payoffDate)
  const minimum=projectRecovery(assumptions({extraDebt:5000,reserve:12000}),{...source(),debts},'expected',{minimumOnly:true})
  assert.ok(p.totalInterest<minimum.totalInterest)
})
test('missing anchors and unsupported debt interest methods produce unavailable results',()=>{
  const p=projectRecovery(assumptions({extraDebt:10000}),{debts:[{id:'fixed',currentBalance:1000,interestMethod:'Fixed interest per payment'}]})
  assert.equal(p.months[0].closing,null)
  assert.equal(p.totalInterest,null)
  assert.equal(p.months[0].extraDebt,0)
})
test('invalid dates, negative expenses, unbounded horizons and unknown fields are rejected',()=>{
  for(const patch of [{taxDate:'2026-02-30'},{paycheck:-1},{end:'2040-01-01'},{start:'2028-01-01'},{reserve:NaN},{owner:'someone'}])assert.throws(()=>validateRecovery({...RECOVERY_DEFAULT,...patch}))
})

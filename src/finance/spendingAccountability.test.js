import test from 'node:test'
import assert from 'node:assert/strict'
import {buildSpendingAccountability} from './spendingAccountability.js'
import {applyBudgetTarget} from './budgetBreakdown.js'
import {buildMeetingPacket,meetingPacketText} from './meetingPackets.js'
import {normalizeActionOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
const accounts=[{id:'a',name:'Operating',type:'checking',plaidAccountId:'bank',plaidType:'depository',plaidSubtype:'checking',balance:1000}]
const tx=(id,date,amount,category='Food',extra={})=>({id,date,amount,category,accountId:'bank',name:id,...extra})
const plan={id:'groceries',acct:'a',name:'Groceries',cat:'Food',type:'expense',amount:100,freq:'monthly',start:'2026-01-01'}
const payload={lineId:'a:groceries',recordId:'groceries',accountId:'a',lineName:'Groceries',category:'Food',direction:'expense',year:2026,month:9,value:100}
const budget=applyBudgetTarget({},payload,{changedAt:'2026-09-30T12:00:00Z',actor:'Larry'})
const build=extra=>buildSpendingAccountability({accounts,scheduled:[plan],budget,period:{from:'2026-10-01',to:'2026-10-31'},...extra})
test('category allowance covers unscheduled purchases; only the excess is over budget',()=>{
 const m=build({actuals:[tx('g1','2026-10-10',80),tx('g2','2026-10-25',40),tx('u','2026-10-25',30,'Subscriptions')]})
 assert.equal(m.rows[0].classification,'budgeted');assert.equal(m.rows[1].classification,'over');assert.equal(m.rows[1].exceptionAmount,20)
 assert.deepEqual(m.totals,{unbudgeted:30,over:20,review:0})
})
test('weekly report accounts for earlier monthly consumption and never adds pending or transfers',()=>{
 const m=build({period:{from:'2026-10-25',to:'2026-10-31'},actuals:[tx('early','2026-10-10',80),tx('today','2026-10-25',40),tx('hold','2026-10-25',100,'Food',{pending:true}),tx('transfer','2026-10-25',900,'TRANSFER_OUT')]})
 assert.equal(m.rows.length,1);assert.equal(m.totals.over,20);assert.equal(m.pending.length,1);assert.equal(m.postedSpending,40)
})
test('reviewed decisions do not remove exceptions and budget amendments preserve baseline',()=>{
 const revised=applyBudgetTarget(budget,{...payload,value:200},{changedAt:'2026-10-25T12:00:00Z',actor:'Larry'})
 const m=build({budget:revised,actuals:[tx('g','2026-10-25',150)],reviews:{g:{status:'reviewed'}}})
 assert.equal(m.totals.over,50);assert.equal(m.rows[0].review.status,'reviewed');assert.equal(revised.targets.a['2026']['a:groceries'][9],200);assert.equal(revised.originalTargets.a['2026']['a:groceries'][9],100)
})
test('a new retroactive allocation does not erase previously unbudgeted purchases',()=>{
 const retro=applyBudgetTarget({},payload,{changedAt:'2026-10-25T12:00:00Z'})
 assert.equal(build({budget:retro,actuals:[tx('g','2026-10-20',70)]}).totals.unbudgeted,70)
})
test('all five meeting cadences include source transaction evidence in screen data and archive',()=>{
 for(const cadence of ['daily','weekly','monthly','quarterly','yearly']){
  const p=buildMeetingPacket({accounts,scheduled:[plan],budget,actuals:[tx('exception','2026-10-25',30,'Subscriptions')],cadence,mode:'current',now:new Date('2026-10-25T21:00:00Z')})
  assert.equal(p.spending.totals.unbudgeted,30,cadence);assert.match(meetingPacketText(p),/source exception/)
 }
})
test('source identity, review history and linked follow-up survive reviewed writes',()=>{
 const op=normalizeActionOperation({type:'finance.spending.review',targetId:'tx1',payload:{status:'reviewed',notes:'One-time exception'}})
 assert.equal(resourceForOperation(op),'shared:lslj_finance_v9')
 const state={accounts,transactions:[plan]},context={actor:'Larry',now:()=>new Date('2026-10-25T21:00:00Z')}
 const saved=applyRecordOperation(state,op,undefined,context).after
 const updated=applyRecordOperation(saved,{...op,payload:{status:'reduce',notes:'Review next month'}},undefined,context).after
 assert.equal(updated.spendingReviews.tx1.history.length,2);assert.deepEqual(updated.accounts,accounts);assert.deepEqual(updated.transactions,[plan])
 const create=normalizeActionOperation({type:'meeting.action.create',payload:{text:'Review charge',owner:'Larry',due:'2026-10-28',status:'open',cadence:'daily',transactionId:'tx1'}})
 const meeting=applyRecordOperation({},create,()=> 'followup',context).after
 assert.equal(meeting.openActions[0].transactionId,'tx1')
 const outcome=normalizeActionOperation({type:'meeting.action.update',targetId:'followup',payload:{verifiedResult:'Cancellation confirmation received; no refund yet.',status:'done'}})
 assert.equal(applyRecordOperation(meeting,outcome,undefined,context).after.openActions[0].verifiedResult,'Cancellation confirmation received; no refund yet.')
})
test('a complete monthly net-cash-flow bridge reconciles favorable and unfavorable variances exactly',()=>{
 const income={id:'income',acct:'a',name:'Salary',type:'income',amount:1000,freq:'monthly',start:'2026-01-01'}
 const b=applyBudgetTarget(budget,{...payload,lineId:'a:income',recordId:'income',lineName:'Salary',direction:'income',category:'Income',value:1000},{changedAt:'2026-09-30T12:00:00Z'})
 const m=build({today:'2026-11-01',scheduled:[plan,income],budget:b,actuals:[tx('salary','2026-10-20',-900,'INCOME'),tx('food','2026-10-20',80),tx('subscription','2026-10-25',30,'Subscriptions'),tx('refund','2026-10-25',-10,'REFUND')]})
 assert.equal(build({today:'2026-10-25',scheduled:[plan,income],budget:b}).bridge,null)
 assert.equal(m.bridge.target,900);assert.equal(m.bridge.actual,800);assert.equal(m.bridge.gap,100)
 assert.equal(m.bridge.income+m.bridge.unbudgeted+m.bridge.budgetedVariance+m.bridge.otherInflows+m.bridge.unexplained,m.bridge.gap)
})

test('Prosper projection keeps its allocation when unrelated debt spending occurs earlier',()=>{
 const prosper={id:'prosper',acct:'a',name:'LJ Prosper Loan Payment',cat:'Debt',type:'expense',amount:904.03,freq:'once',start:'2026-10-05'}
 const other={...prosper,id:'other',name:'Other obligation',amount:282,start:'2026-10-20'}
 const result=build({budget:{},scheduled:[prosper,other],actuals:[tx('early','2026-10-01',593,'Debt'),tx('prosper-bank','2026-10-05',904.03,'Debt',{name:'Prosper Marketplace'})]})
 assert.equal(result.rows[1].classification,'planned')
 assert.equal(result.rows[1].matchedPlanId,'prosper')
 assert.equal(result.rows[1].exceptionAmount,0)
 assert.equal(result.rows[0].exceptionAmount,311)
 assert.equal(result.totals.over,311)
 assert.equal(result.postedSpending,1497.03)
})
test('changed merchant amount remains matched and only the uncovered variance is over budget',()=>{
 const prosper={id:'prosper',acct:'a',name:'LJ Prosper Loan Payment',cat:'Debt',type:'expense',amount:904.03,freq:'once',start:'2026-10-05'}
 for(const amount of [850,1000]) {
  const result=build({budget:{},scheduled:[prosper],actuals:[tx('posted','2026-10-07',amount,'Other',{name:'Prosper Marketplace'})]})
  assert.equal(result.rows[0].matchedPlanId,'prosper')
  assert.equal(result.rows[0].category,'Debt')
  assert.equal(result.rows[0].classification,amount<904.03?'planned':'over')
  assert.equal(result.rows[0].exceptionAmount,amount<904.03?0:95.97)
 }
})
test('duplicate payments and unrelated vendors cannot silently settle one projection',()=>{
 const prosper={id:'prosper',acct:'a',name:'LJ Prosper Loan Payment',cat:'Debt',type:'expense',amount:904.03,freq:'once',start:'2026-10-05'}
 const posted=tx('posted','2026-10-05',904.03,'Debt',{name:'Prosper Marketplace'})
 for(const actuals of [[posted,{...posted,id:'duplicate'}],[{...posted,accountId:'different'}],[{...posted,name:'Other Loan Payment'}],[{...posted,pending:true}]]) {
  const result=build({budget:{},scheduled:[prosper],actuals})
  assert.ok([...result.rows,...result.pending].every(row=>!row.matchedPlanId))
 }
})

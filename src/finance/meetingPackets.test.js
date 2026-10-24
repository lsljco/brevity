import test from 'node:test'
import assert from 'node:assert/strict'
import {MEETING_POLICIES,buildMeetingPacket,meetingPeriod,meetingPacketText} from './meetingPackets.js'

const now=new Date('2026-10-24T13:00:00Z')
const accounts=[{id:'cash',name:'Operating',type:'checking',balance:1000,plaidAccountId:'bank'}]
const bank=(id,date,amount,extra={})=>({id,accountId:'bank',date,amount,name:'Groceries',category:'Food',pending:false,...extra})
const options={now,accounts,balanceDataStatus:'fresh',transactionFreshnessStatus:'fresh',balanceCheckedAt:now.toISOString(),transactionCheckedAt:now.toISOString()}

test('FIN-001 durations, mandated subjects and quarter/annual deadlines are retained',()=>{
  assert.deepEqual(Object.values(MEETING_POLICIES).map(p=>p.duration),['7–10 minutes','20–30 minutes','45–60 minutes','75–90 minutes','2.5–3 hours'])
  const p=buildMeetingPacket({...options,cadence:'quarterly',mode:'previous'})
  assert.deepEqual([p.period.from,p.period.to],['2026-07-01','2026-09-30'])
  assert.deepEqual(p.budgetMilestones.map(m=>m.due),['2026-09-30','2026-10-31'])
  assert.match(meetingPacketText(p),/Month-over-month Budget vs. Actual/)
  assert.equal(p.agenda.reduce((s,a)=>s+a.minutes,0),85)
})
test('completed and current periods handle New York midnight, leap year and year rollover',()=>{
  assert.equal(meetingPeriod('daily','current',new Date('2026-10-25T02:00:00Z')).from,'2026-10-24')
  assert.deepEqual(meetingPeriod('monthly','previous',new Date('2024-03-01T14:00:00Z')), {from:'2024-02-01',to:'2024-02-29',prior:{from:'2024-01-01',to:'2024-01-31'},mode:'previous'})
  assert.equal(meetingPeriod('quarterly','previous',new Date('2026-01-15T14:00:00Z')).from,'2025-10-01')
  assert.equal(meetingPeriod('yearly','previous',now).to,'2025-12-31')
  assert.equal(meetingPeriod('weekly','current',now).from,'2026-10-18')
})
test('posted/pending/projected stay distinct, transfers and superseded holds are excluded',()=>{
  const actuals=[bank('income','2026-10-23',-500,{category:'Income',name:'Payroll'}),bank('expense','2026-10-23',100,{pendingTransactionId:'hold'}),bank('hold','2026-10-22',100,{pending:true}),bank('pending','2026-10-24',20,{pending:true}),bank('transfer','2026-10-23',900,{category:'Transfer'}),bank('type-transfer','2026-10-23',50,{type:'transfer'}),bank('refund','2026-10-23',-10,{name:'Purchase refund'}),bank('outside','2026-10-23',100,{accountId:'other'})]
  const scheduled=[{id:'bill',type:'expense',acct:'cash',name:'Utility',amount:80,freq:'once',start:'2026-10-24'}]
  const p=buildMeetingPacket({...options,cadence:'daily',mode:'previous',actuals,scheduled})
  assert.deepEqual(p.posted,{income:500,otherInflows:10,expenses:100,net:410})
  assert.equal(p.pending.expenses,20)
  assert.equal(p.pendingItems.length,1)
  assert.equal(p.payables[0].amount,80)
  assert.equal(p.payables[0].status,'Projected · payment unconfirmed')
})
test('fresh empty snapshot, stale missing data, zero and ambiguous account links remain distinct',()=>{
  assert.equal(buildMeetingPacket({...options}).posted.net,0)
  assert.equal(buildMeetingPacket({...options,transactionFreshnessStatus:'stale'}).posted,null)
  assert.equal(buildMeetingPacket({...options,accounts:[]}).cashBalance,null)
  assert.equal(buildMeetingPacket({...options,accounts:[...accounts,{...accounts[0],id:'second'}],actuals:[bank('a','2026-10-24',2)]}).posted,null)
  assert.equal(buildMeetingPacket({...options,accounts:[{...accounts[0],balance:0}]}).cashBalance,0)
  assert.equal(buildMeetingPacket({...options,now:new Date('2026-10-26T14:00:00Z')}).sources.transactionFreshnessStatus,'stale')
})
test('budget targets are category/account/year/month specific and missing is not zero',()=>{
  const scheduled=[{id:'food',acct:'cash',type:'expense',cat:'Food',name:'Groceries',amount:50,freq:'monthly',start:'2026-01-01'}]
  const budget={schemaVersion:2,targets:{cash:{2026:{'cash:food':{9:300}}}}}
  const p=buildMeetingPacket({...options,cadence:'monthly',mode:'current',scheduled,budget,actuals:[bank('expense','2026-10-23',100)]})
  assert.deepEqual(p.categoryBudget[0],{category:'Food',budget:300,missingTargets:0,planningBaseline:50,posted:100,remaining:200})
  const missing=buildMeetingPacket({...options,cadence:'quarterly',mode:'current',scheduled,budget,actuals:[bank('expense','2026-10-23',100)]})
  // Current quarter only touches October; future months aren't compared to posted actuals yet.
  assert.equal(missing.categoryBudget[0].budget,300)
  const lastQuarter=buildMeetingPacket({...options,cadence:'quarterly',mode:'previous',scheduled,budget})
  assert.equal(lastQuarter.categoryBudget[0].budget,null)
  const zero=buildMeetingPacket({...options,cadence:'monthly',mode:'current',scheduled,budget:{schemaVersion:2,targets:{cash:{2026:{'cash:food':{9:0}}}}}})
  assert.equal(zero.categoryBudget[0].budget,0)
})
test('open actions carry forward, missing owners/deadlines remain visible and bank data is never mutated',()=>{
  const input={...options,actuals:[bank('e','2026-10-24',5)],actions:[{id:'old',text:'Call utility',due:'2026-10-20',owner:'Terica',status:'open'},{id:'missing',text:'Review invoice',status:'blocked'},{id:'done',status:'done'}]}
  const before=structuredClone(input),p=buildMeetingPacket(input)
  assert.equal(p.openActions.length,2)
  assert.equal(p.openActions[0].overdue,true)
  assert.equal(p.openActions[1].missingDeadline,true)
  assert.deepEqual(input,before)
  assert.match(meetingPacketText(p),/Owner required/)
  assert.match(meetingPacketText(p),/does not certify a close/)
})
test('approved schedule reconciliation marks paid evidence without inferring payment from a date',()=>{
  const actual=bank('posted','2026-10-24',80,{name:'Utility',originalStatement:'Utility'})
  const scheduled=[{id:'bill',type:'expense',acct:'cash',name:'Utility',amount:80,freq:'once',start:'2026-10-24',reconciliation:{actualId:'posted',bankAccountId:'bank',postedDate:'2026-10-24',actualAmount:80,bankName:'Utility',budgetAmount:80}}]
  const p=buildMeetingPacket({...options,actuals:[actual],scheduled})
  assert.equal(p.payables[0].status,'Reconciled to posted charge')
})

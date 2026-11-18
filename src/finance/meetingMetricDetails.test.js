import test from 'node:test'
import assert from 'node:assert/strict'
import {buildMeetingPacket,MEETING_POLICIES} from './meetingPackets.js'
import {meetingBrief} from './meetingBrief.js'
import {meetingMetricDetails} from './meetingMetricDetails.js'
import {effectiveMeetingPacket} from './meetingPacketIntelligence.js'
const now=new Date('2026-11-18T16:00:00Z')
const options={now,accounts:[{id:'cash',name:'Operating',type:'checking',balance:1000,plaidAccountId:'bank'}],transactionFreshnessStatus:'fresh',transactionCheckedAt:now.toISOString(),scheduled:[{id:'bill',acct:'cash',name:'Utility forecast',type:'expense',amount:80,freq:'once',start:'2026-11-19'}],actions:[{id:'one',text:'Review utility',transactionId:'bill',owner:'Larry',due:'2026-11-19',status:'open'},{id:'two',text:'Call insurer',owner:'Terica',due:'2026-11-17',status:'open'},{id:'three',text:'Set a date',status:'open'},{id:'done',text:'Finished',status:'complete'}]}
test('commitment count opens the exact three records with due and explicitly linked forecast dates',()=>{
 const p=buildMeetingPacket({...options,cadence:'weekly'})
 const d=meetingMetricDetails(p,'Open commitments',3,'count')
 assert.equal(d.valueType,'count');assert.equal(d.children.length,3)
 assert.match(d.children[0].meta,/Due: 2026-11-19/);assert.match(d.children[0].meta,/Cash forecast: 2026-11-19/)
 assert.equal(d.children[1].valueLabel,'Overdue');assert.match(d.children[1].meta,/No linked cash forecast/)
 assert.match(d.children[2].meta,/Due date not set/)
})
test('every meeting metric reconciles to scoped source records for every cadence',()=>{
 for(const cadence of Object.keys(MEETING_POLICIES)){
  const first=buildMeetingPacket({...options,cadence,mode:'previous'})
  const bank=(id,amount,extra={})=>({id,name:id,amount,accountId:'bank',date:first.period.from,pending:false,...extra})
  const p=buildMeetingPacket({...options,cadence,mode:'previous',actuals:[bank('payroll',-500,{category:'Income'}),bank('purchase',120),bank('refund',-10),bank('pending',999,{pending:true}),bank('transfer',800,{category:'Transfer'}),bank('outside',999,{accountId:'other'}),bank('prior',25,{date:first.period.prior.from})]})
  for(const [label,amount,,type] of meetingBrief(p).metrics){
   const d=meetingMetricDetails(p,label,amount,type)
   if(type==='count')assert.equal(d.children.length,amount)
   else if(amount!==null)assert.equal(Math.round(d.children.reduce((s,r)=>s+r.amount,0)*100),Math.round(amount*100),label)
   assert.ok(d.children.every(r=>!['pending','transfer','outside'].includes(r.id)))
  }
  assert.equal(p.postedItems.length,3)
  assert.equal(meetingMetricDetails(p,'Posted income',p.posted.income).children[0].id,'payroll')
  assert.deepEqual(meetingMetricDetails(p,'Posted spending',p.posted.expenses).children.map(r=>r.id),['purchase'])
 }
})
test('reviewed report adjustments are explicit contributions and missing sources never become zero',()=>{
 const p=effectiveMeetingPacket(buildMeetingPacket({...options,cadence:'weekly',actuals:[{id:'income',name:'Pay',amount:-500,category:'Income',accountId:'bank',date:'2026-11-18'}]}),{weekly:{'posted/income':{value:550,reason:'Statement correction'}}})
 const d=meetingMetricDetails(p,'Posted income',p.posted.income)
 assert.deepEqual(d.children.map(r=>r.amount),[500,50]);assert.match(d.children[1].meta,/Statement correction/)
 const empty=buildMeetingPacket({now,cadence:'weekly'})
 const missing=meetingMetricDetails(empty,'Posted income',empty.posted?.income)
 assert.equal(missing.amount,undefined);assert.deepEqual(missing.children,[]);assert.match(missing.emptyMessage,/unavailable/)
})

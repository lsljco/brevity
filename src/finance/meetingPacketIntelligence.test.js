import test from 'node:test'
import assert from 'node:assert/strict'
import {buildMeetingPacket} from './meetingPackets.js'
import {analyzeMeetingPacket,applyPacketEdit,effectiveMeetingPacket,editablePacketFields,packetIdentity,normalizePacketEdit,packetMatchesRequest} from './meetingPacketIntelligence.js'
import {createFinancePacketService,generatePacketNarrative} from '../../netlify/lib/finance-packet-service.mjs'
import {createFinancePacketHandler} from '../../netlify/functions/finance-meeting-packet.mjs'
import {createPacketBackgroundHandler} from '../../netlify/functions/finance-meeting-packets-background.mjs'
import {dispatchPackets} from '../../netlify/functions/finance-meeting-packets-scheduled.mjs'

const now=new Date('2026-10-24T13:00:00Z')
const input={now,accounts:[{id:'cash',name:'Operating',type:'checking',plaidAccountId:'bank',balance:100}],scheduled:[{id:'bill',acct:'cash',type:'expense',amount:500,name:'Utility',cat:'Utilities',freq:'once',start:'2026-10-24'}],actuals:[{id:'tx',accountId:'bank',date:'2026-10-24',amount:20,name:'Utility',category:'Utilities'}],actions:[{id:'old',text:'Follow up',status:'open',owner:'Terica',due:'2026-10-20'}],balanceDataStatus:'cached',transactionFreshnessStatus:'cached'}
const packet=()=>buildMeetingPacket(input)
const command=(p,field,value,scope='period')=>({packetId:packetIdentity(p),cadence:p.cadence,scope,field,value,reason:'Reviewed household context'})
const memoryStore=()=>{const values=new Map();let n=0;return {get:async k=>structuredClone(values.get(k)?.data??null),getWithMetadata:async k=>structuredClone(values.get(k)||null),setJSON:async(k,data,opts={})=>{const prev=values.get(k);if(opts.onlyIfNew&&prev||opts.onlyIfMatch&&opts.onlyIfMatch!==prev?.etag)return{modified:false};values.set(k,{data:structuredClone(data),etag:String(++n)});return{modified:true}}}}

test('prepared server snapshots remain usable across freshness differences but never cross scope or period',()=>{
  const local=packet(),remote=structuredClone(local)
  remote.sources.transactionFreshnessStatus='unknown'
  remote.posted=null
  remote.cashBalance=250
  assert.equal(packetMatchesRequest(local,remote),true)
  assert.equal(packetMatchesRequest(local,{...remote,scope:[{id:'other'}]}),false)
  assert.equal(packetMatchesRequest(local,{...remote,period:{...remote.period,mode:'previous'}}),false)
  assert.equal(packetMatchesRequest(local,{...remote,asOf:'2026-10-25'}),false)
  assert.equal(packetMatchesRequest(local,null),false)
})

test('automatically produces concrete direction, proposed actions, owners and deadlines without any form input',()=>{
  const p=packet(),analysis=analyzeMeetingPacket(p)
  assert.match(analysis.direction,/cash coverage/)
  assert.match(analysis.insights,/\$400/)
  assert(analysis.recommendations.every(a=>a.text&&a.owner&&a.due))
  assert(analysis.recommendations.some(a=>a.id==='overdue-actions'))
})
test('any report amount can be adjusted including unavailable numbers; zero remains zero and source stays intact',()=>{
  const p=packet(),before=structuredClone(p)
  let state=applyPacketEdit({},command(p,'posted/income',200))
  state=applyPacketEdit(state,command(p,'cashBalance',0))
  state=applyPacketEdit(state,command(p,'prior/income',100))
  const effective=effectiveMeetingPacket(p,state.packetEdits)
  assert.equal(effective.posted.net,180)
  assert.equal(effective.cashBalance,0)
  assert.equal(effective.prior.income,100)
  assert.equal(effective.prior.net,null)
  assert.deepEqual(p,before)
  assert.equal(effective.adjustments.find(a=>a.field==='cashBalance').sourceValue,100)
})
test('edits survive changed source values, period edits expire, cadence edits persist and reset restores automatic figures',()=>{
  const p=packet()
  let state=applyPacketEdit({},command(p,'cashBalance',0,'cadence'))
  state=applyPacketEdit(state,command(p,'cashBalance',250))
  assert.equal(effectiveMeetingPacket({...p,cashBalance:900},state.packetEdits).cashBalance,250)
  const tomorrow=buildMeetingPacket({...input,now:new Date('2026-10-25T13:00:00Z')})
  assert.equal(effectiveMeetingPacket(tomorrow,state.packetEdits).cashBalance,0)
  state=applyPacketEdit(state,{...command(p,'cashBalance',0),reset:true})
  assert.equal(effectiveMeetingPacket(p,state.packetEdits).cashBalance,0)
  state=applyPacketEdit(state,{...command(p,'cashBalance',0,'cadence'),reset:true})
  assert.equal(effectiveMeetingPacket(p,state.packetEdits).cashBalance,100)
})
test('notes, AI insights, proposed action text and direct totals remain editable after regeneration',()=>{
  const p=packet();let state={}
  for(const [field,value] of [['notes','Household context'],['analysis/summary','Our summary'],['analysis/insights','Our insights'],['analysis/actions','Call vendor tomorrow'],['posted/net',777]])state=applyPacketEdit(state,command(p,field,value))
  const effective=effectiveMeetingPacket(p,state.packetEdits,{summary:'New AI summary',insights:'AI insights'})
  assert.equal(effective.notes,'Household context')
  assert.equal(effective.analysis.summary,'Our summary')
  assert.equal(effective.analysis.actions,'Call vendor tomorrow')
  assert.equal(effective.posted.net,777)
  assert.match(effective.analysis.summary,/Our/)
})
test('stable row edits never migrate to a different obligation on reorder/removal',()=>{
  const p=packet(),field=editablePacketFields(effectiveMeetingPacket(p)).find(f=>f.field.startsWith('payables/')&&f.field.endsWith('/amount')).field
  const state=applyPacketEdit({},command(p,field,45))
  assert.equal(effectiveMeetingPacket(p,state.packetEdits).payables[0].amount,45)
  const removed={...p,payables:[{id:'different',amount:99,title:'Other'}]}
  const e=effectiveMeetingPacket(removed,state.packetEdits)
  assert.equal(e.payables[0].amount,99)
  assert.deepEqual(e.orphanedAdjustments,[field])
  assert.throws(()=>normalizePacketEdit(command(p,'analysis/__proto__/value',2)),/editable/)
  assert.throws(()=>normalizePacketEdit(command(p,'cashBalance',Infinity)),/finite/)
})
test('automatic analysis is cached, source edits regenerate it and outages return useful calculated guidance',async()=>{
  const cache=memoryStore();let calls=0,edits={}
  const service=createFinancePacketService({load:async()=>({...input,edits}),cacheFactory:()=>cache,now:()=>now,generate:async()=>{calls++;return{state:'ready',narrative:{summary:'AI summary',direction:'AI direction',insights:'AI insights',actions:'AI actions',mode:'AI analysis'}}}})
  const a=await service({cadence:'daily'}),b=await service({cadence:'daily'})
  assert.equal(calls,1)
  assert.equal(a.identity,b.identity)
  edits=applyPacketEdit({},command(packet(),'cashBalance',0)).packetEdits
  const c=await service({cadence:'daily'})
  assert.equal(calls,2)
  assert.equal(c.packet.cashBalance,0)
  const fallback=createFinancePacketService({load:async()=>input,cacheFactory:()=>memoryStore(),now:()=>now,generate:async()=>{throw Error('offline')}})
  const f=await fallback({cadence:'daily'})
  assert.equal(f.analysisState,'unavailable')
  assert.match(f.packet.analysis.actions,/Owner:/)
})
test('AI adapter uses supplied deployed connection, bounds input, parses complete output and does not execute actions',async()=>{
  let request
  const result=await generatePacketNarrative(effectiveMeetingPacket(packet()),{key:'test-only-not-a-secret',fetcher:async(url,options)=>{request=JSON.parse(options.body);return{ok:true,json:async()=>({output:[{content:[{text:JSON.stringify({summary:'Summary',direction:'Direction',insights:'Insights',actions:'Proposed actions'})}]}]})}}})
  assert.equal(result.state,'ready')
  assert.equal(request.store,false)
  assert.match(request.instructions,/Never claim payment/)
  assert.equal((await generatePacketNarrative(packet(),{key:''})).state,'unconfigured')
})
test('report endpoint requires financial access and does not accept financial facts from browser input',async()=>{
  let prepared=0
  const make=(session,perms={})=>createFinancePacketHandler({authenticate:async()=>session,permissions:async()=>perms,prepare:async args=>{prepared++;return{args}}})
  const req=()=>new Request('https://example.test',{method:'POST',body:JSON.stringify({cadence:'daily',cashBalance:999})})
  assert.equal((await make(null)(req())).status,401)
  assert.equal((await make({member:'Javin',role:'member'})(req())).status,403)
  const response=await make({member:'Larry',role:'admin'})(req())
  assert.equal(response.status,200)
  assert.equal(prepared,1)
  assert.equal((await response.json()).args.cashBalance,undefined)
})
test('scheduled preparation covers five cadences/current and prior periods once at 5am New York with protected background access',async()=>{
  let dispatched=0
  const options={secret:'test-automation',fetcher:async()=>{dispatched++;return{ok:true}}}
  await dispatchPackets({...options,now:new Date('2026-07-01T09:00:00Z')})
  await dispatchPackets({...options,now:new Date('2026-07-01T10:00:00Z')})
  await dispatchPackets({...options,now:new Date('2026-12-01T10:00:00Z')})
  assert.equal(dispatched,2)
  const calls=[],background=createPacketBackgroundHandler({secret:()=>options.secret,prepare:async x=>calls.push(x)})
  assert.equal((await background(new Request('https://example.test',{method:'POST'}))).status,401)
  assert.equal((await background(new Request('https://example.test',{method:'POST',headers:{'x-brevity-automation-key':options.secret}}))).status,200)
  assert.equal(calls.length,10)
})

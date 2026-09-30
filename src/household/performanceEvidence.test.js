import test from 'node:test'
import assert from 'node:assert/strict'
import {createPerformanceEvidenceHandler,evidenceDates} from '../../netlify/functions/household-performance-evidence.mjs'
const event={httpMethod:'GET',queryStringParameters:{from:'2026-09-30',to:'2026-09-30',member:'Terica'}}
test('performance evidence requires a session and rejects mutations',async()=>{
 let reads=0
 const resources={read:async()=>{reads++;return {missing:true}}}
 assert.equal((await createPerformanceEvidenceHandler({readSession:async()=>null,resources})(event)).statusCode,401)
 assert.equal((await createPerformanceEvidenceHandler({readSession:async()=>({member:'Larry'}),resources})({...event,httpMethod:'POST'})).statusCode,405)
 assert.equal(reads,0)
})
test('performance evidence reads only the authenticated member activity and minimal shared plan fields',async()=>{
 const keys=[]
 const handler=createPerformanceEvidenceHandler({readSession:async()=>({member:'Larry',role:'admin'}),resources:{read:async key=>{
  keys.push(key)
  return {value:key.startsWith('plan:')?{assignments:[{id:'task'}],decisions:[],spiritual:{privateNotes:'not requested'}}:{entries:[{id:'own',member:'Larry'},{id:'foreign',member:'Terica'}]}}
 }}})
 const result=await handler(event),body=JSON.parse(result.body)
 assert.deepEqual(keys,['plan:2026-09-30','activity:Larry:2026-09-30'])
 assert.deepEqual(body.dailyPlans,[{date:'2026-09-30',assignments:[{id:'task'}],decisions:[]}])
 assert.deepEqual(body.reportedActivities.map(item=>item.id),['own'])
 assert.equal(result.headers['cache-control'],'no-store')
})
test('missing evidence and unavailable evidence are distinct',async()=>{
 const handler=createPerformanceEvidenceHandler({readSession:async()=>({member:'Larry'}),resources:{read:async key=>{
  if(key.startsWith('plan:'))throw Error('storage unavailable')
  return {missing:true,value:{entries:[]}}
 }}})
 const body=JSON.parse((await handler(event)).body)
 assert.deepEqual(body.unavailable,[{date:'2026-09-30',source:'daily-plan'}])
 assert.deepEqual(body.reportedActivities,[])
})
test('evidence date ranges reject impossible dates, reversed ranges, and oversized requests',()=>{
 assert.deepEqual(evidenceDates('2026-09-29','2026-09-30'),['2026-09-29','2026-09-30'])
 for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-10-01','2026-09-01'],['2025-01-01','2026-09-30'],['','']])assert.throws(()=>evidenceDates(from,to))
})

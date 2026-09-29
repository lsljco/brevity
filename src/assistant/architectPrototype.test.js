import test from 'node:test'
import assert from 'node:assert/strict'
import {approvedPrototypePacket,requestArchitectPrototype} from '../../netlify/lib/architect-prototype.mjs'
const record={id:'fixture',stage:'implementation-planned',updatedBy:'Larry',updatedAt:'2026-09-29',title:'Fixture',problem:'Reported issue',requirements:'Improve contrast',userStories:'Readable notes',dataChanges:'None',permissionChanges:'None',testPlan:'Contrast and build',rolloutPlan:'Isolated preview',rollbackPlan:'Revert commit'}
test('prototype dispatch requires approved implementation, authorized administrator and configured production integration',async()=>{
 assert.throws(()=>approvedPrototypePacket({...record,stage:'proposed'}),/approve/)
 assert.throws(()=>approvedPrototypePacket({...record,updatedBy:'Terica'}),/approve/)
 const base={record,member:'Larry',role:'admin',preview:false}
 await assert.rejects(()=>requestArchitectPrototype({...base,member:'Isaiah'}),/Only Larry or Lorenzo/)
 await assert.rejects(()=>requestArchitectPrototype({...base,preview:true}),/disabled in deploy previews/)
 await assert.rejects(()=>requestArchitectPrototype({...base,token:''}),/not connected/)
})
test('prototype dispatch is idempotent, sends approved fields only and never reports implementation success',async()=>{
 const values=new Map(),store={get:async key=>values.get(key),setJSON:async(key,value,options={})=>{if(options.onlyIfNew&&values.has(key))return{modified:false};values.set(key,value);return{modified:true}}};let calls=0,payload
 const args={record:{...record,privateChat:'must not transmit'},member:'Larry',role:'admin',preview:false,token:'test-only',store,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/repos/lsljco/brevity/actions/workflows/architect-prototype.yml/dispatches');payload=JSON.parse(options.body);return{status:204}}}
 const first=await requestArchitectPrototype(args),second=await requestArchitectPrototype(args)
 assert.equal(calls,1);assert.equal(first.state,'dispatched');assert.equal(second.id,first.id);assert.match(first.notice,/not an implemented feature/)
 assert.equal(payload.ref,'main');assert.equal(JSON.parse(payload.inputs.packet).privateChat,undefined)
})
test('uncertain dispatch is retained and never automatically repeated',async()=>{
 const values=new Map(),store={get:async key=>values.get(key),setJSON:async(key,value)=>{values.set(key,value);return{modified:true}}};let calls=0
 const args={record,member:'Larry',role:'admin',preview:false,token:'test-only',store,fetcher:async()=>{calls++;throw Error('timeout')}}
 assert.equal((await requestArchitectPrototype(args)).state,'dispatch-unknown');await requestArchitectPrototype(args);assert.equal(calls,1)
})

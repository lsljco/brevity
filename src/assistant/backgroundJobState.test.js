import test from 'node:test'
import assert from 'node:assert/strict'
import {readBackgroundJob} from '../../netlify/lib/background-job-state.mjs'
const queued={state:'queued',createdAt:new Date(0).toISOString(),body:{privateInput:'fixture'}}
test('expired unclaimed jobs fail promptly and discard input',async()=>{
 let data=queued
 const store={getWithMetadata:async()=>({data,etag:'v1'}),setJSON:async(key,next,options)=>{assert.equal(options.onlyIfMatch,'v1');data=next;return {modified:true}}}
 const result=await readBackgroundJob(store,'job',{now:90001})
 assert.equal(result.state,'failed');assert.equal(result.statusCode,503);assert.equal(result.body,undefined)
})
test('a simultaneous worker claim wins over startup expiry',async()=>{
 let data=queued
 const store={getWithMetadata:async()=>({data,etag:'v1'}),setJSON:async()=>{data={...queued,state:'processing'};return {modified:false}}}
 assert.equal((await readBackgroundJob(store,'job',{now:90001})).state,'processing')
})
test('recent and processing jobs are not expired by startup timeout',async()=>{
 for(const [data,now] of [[queued,1000],[{...queued,state:'processing'},90001]]){
 const store={getWithMetadata:async()=>({data,etag:'v1'}),setJSON:async()=>assert.fail('must not write')}
 assert.equal((await readBackgroundJob(store,'job',{now})).state,data.state)
 }
})

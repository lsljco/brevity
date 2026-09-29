import test from 'node:test'
import assert from 'node:assert/strict'
import {runWithProviderRecovery} from '../../netlify/lib/agent-provider-recovery.mjs'
test('temporary token limits retry with bounded backoff before returning an answer',async()=>{
 let attempts=0;const waits=[]
 const answer=await runWithProviderRecovery(async()=>{if(++attempts<3)throw Error('429 Rate limit reached');return 'answer'},{sleep:async ms=>waits.push(ms)})
 assert.equal(answer,'answer');assert.deepEqual(waits,[15000,30000])
})
test('billing limits and non-provider failures never retry',async()=>{
 for(const error of [Object.assign(Error('insufficient_quota'),{status:429}),Error('invalid proposal')]){
  let attempts=0
  await assert.rejects(()=>runWithProviderRecovery(async()=>{attempts++;throw error},{sleep:async()=>assert.fail('must not wait')}))
  assert.equal(attempts,1)
 }
})
test('persistent rate limiting exits after two recovery attempts',async()=>{
 let attempts=0
 await assert.rejects(()=>runWithProviderRecovery(async()=>{attempts++;throw Object.assign(Error('limit'),{status:429})},{sleep:async()=>{}}))
 assert.equal(attempts,3)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareFinanceReview} from './prepareFinanceReview.js'
const original={id:'water',amount:260.28,name:'Water'}
const input={expectedVersion:1,operation:{type:'recurring.update',targetId:'water',payload:{amount:250}}}
const conflict=()=>Object.assign(new Error('Household data changed after your review.'),{code:'VERSION_CONFLICT'})
test('unrelated shared update refreshes once and prepares a new review without altering the draft',async()=>{
 const calls=[];let reads=0
 const result=await prepareFinanceReview({input,original,prepare:async arg=>{calls.push(arg);if(calls.length===1)throw conflict();return {proposal:{id:'review'}}},refresh:async()=>{reads++;return{transactions:[{...original}],version:2}}})
 assert.equal(reads,1);assert.deepEqual(calls.map(x=>x.expectedVersion),[1,2]);assert.equal(result.proposal.id,'review');assert.equal(input.expectedVersion,1);assert.deepEqual(calls[1].operation,input.operation)
})
test('changed or deleted transaction blocks retry',async()=>{
 for(const transactions of [[{...original,amount:300}],[]]){
 let calls=0
 await assert.rejects(()=>prepareFinanceReview({input,original,prepare:async()=>{calls++;throw conflict()},refresh:async()=>({transactions,version:2})}),/transaction changed/)
 assert.equal(calls,1)
 }
})
test('a second version race fails closed and does not loop',async()=>{
 let calls=0
 await assert.rejects(()=>prepareFinanceReview({input,original,prepare:async()=>{calls++;throw conflict()},refresh:async()=>({transactions:[original],version:2})}),{code:'VERSION_CONFLICT'})
 assert.equal(calls,2)
})
test('missing original, other actions and non-conflict errors never retry',async()=>{
 for(const args of [{input,original:null,error:conflict()},{input:{...input,operation:{type:'recurring.delete'}},original,error:conflict()},{input,original,error:new Error('Forbidden')}]){
 let reads=0
 await assert.rejects(()=>prepareFinanceReview({...args,prepare:async()=>{throw args.error},refresh:async()=>{reads++}}))
 assert.equal(reads,0)
 }
})

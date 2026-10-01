import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {forEachPlaidConnection}=require('../../netlify/lib/plaid-connections.cjs')

test('independent items start concurrently while exact item or token repeats remain serialized',async()=>{
  const started=[]
  let releaseFirst,releaseOther,otherStarted
  const first=new Promise(resolve=>{releaseFirst=resolve})
  const other=new Promise(resolve=>{releaseOther=resolve})
  const ready=new Promise(resolve=>{otherStarted=resolve})
  const pending=forEachPlaidConnection([
    {item_id:'one',access_token:'a',institution:'Same bank'},
    {item_id:'two',access_token:'b',institution:'Same bank'},
    {item_id:'one',access_token:'c'},
    {item_id:'three',access_token:'a'},
  ],async(token,index)=>{
    started.push(index)
    if(index===0)await first
    if(index===1){otherStarted();await other}
  })
  await ready
  assert.deepEqual(started,[0,1])
  releaseFirst();releaseOther()
  await pending
  assert.deepEqual(started,[0,1,2,3])
})

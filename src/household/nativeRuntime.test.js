import test from 'node:test'
import assert from 'node:assert/strict'
import stateEndpoint from '../../netlify/functions/household-state.mjs'
import conversationEndpoint from '../../netlify/functions/brevity-conversation.mjs'
import scopedStore from '../../netlify/lib/scoped-store.cjs'

test('native household endpoints preserve anonymous authorization boundaries',async()=>{
  for(const [name,endpoint] of [['household-state',stateEndpoint],['brevity-conversation',conversationEndpoint]]){
    const response=await endpoint(new Request(`https://staging.example/.netlify/functions/${name}`),{})
    assert.ok(response instanceof Response)
    assert.equal(response.status,401)
    assert.match(response.headers.get('content-type'),/json/)
    assert.ok((await response.json()).error)
  }
})
test('statically injected storage preserves scope and strong consistency',()=>{
  let received
  const sentinel={}
  scopedStore.setNativeBlobs({getStore:options=>{received=options;return sentinel}})
  try{
    assert.equal(scopedStore.getStore({name:'household',consistency:'strong'}),sentinel)
    assert.equal(received.name,scopedStore.scopedName('household'))
    assert.equal(received.consistency,'strong')
  }finally{scopedStore.setNativeBlobs(null)}
})

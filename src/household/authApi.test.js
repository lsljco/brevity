import test from 'node:test'
import assert from 'node:assert/strict'
import {loginHouseholdMember, bootstrapHousehold} from './authApi.js'

function transport(t, responses) {
  const calls=[]
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,options})
    const next=responses.shift()
    if(next instanceof Error)throw next
    assert.ok(next,'Unexpected authentication request')
    return new Response(JSON.stringify(next.body),{status:next.status||200,headers:{'content-type':'application/json'}})
  })
  return calls
}

test('login opens only after a separate cookie-authenticated session read',async t=>{
  const session={authenticated:true,member:'Larry',role:'admin',bootstrapRequired:false}
  const calls=transport(t,[{body:{authenticated:true,member:'Larry'}},{body:session}])
  assert.deepEqual(await loginHouseholdMember('Larry','fixture-password'),session)
  assert.deepEqual(calls.map(call=>[call.options.method,call.options.credentials,call.options.cache]),[['POST','include','no-store'],['GET','include','no-store']])
  assert.match(calls[1].url,/action=session$/)
  assert.equal(calls[1].options.body,undefined,'Password is not resent during session verification')
})

test('accepted credentials with a missing or different session fail closed',async t=>{
  for(const session of [{authenticated:false,member:null},{authenticated:true,member:'Nyla'}]){
    const calls=transport(t,[{body:{authenticated:true,member:'Larry'}},{body:session}])
    await assert.rejects(()=>loginHouseholdMember('Larry','fixture-password'),error=>error.code==='SESSION_NOT_RETAINED')
    assert.equal(calls.length,2)
    t.mock.restoreAll()
  }
})

test('bad credentials and failed verification never return an authenticated result',async t=>{
  let calls=transport(t,[{status:401,body:{error:'Incorrect member or password.'}}])
  await assert.rejects(()=>loginHouseholdMember('Larry','wrong'),error=>error.status===401)
  assert.equal(calls.length,1)
  t.mock.restoreAll()
  calls=transport(t,[{body:{authenticated:true,member:'Larry'}},new Error('Network unavailable')])
  await assert.rejects(()=>loginHouseholdMember('Larry','fixture-password'),/Network unavailable/)
  assert.equal(calls.length,2)
})

test('initial account creation also requires retained-session verification',async t=>{
  transport(t,[{status:201,body:{authenticated:true,member:'Larry'}},{body:{authenticated:false,bootstrapRequired:false}}])
  await assert.rejects(()=>bootstrapHousehold('fixture-password'),error=>error.code==='SESSION_NOT_RETAINED')
})

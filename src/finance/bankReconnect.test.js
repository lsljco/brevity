import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const path=require.resolve('../../netlify/legacy-functions/plaid-create-link-token.js')
function install({session={member:'Larry',role:'admin'},preview=false,client={}}={}) {
 const mocks=new Map([
  [require.resolve('../../netlify/lib/household-auth.cjs'),{readSession:async()=>session}],
  [require.resolve('../../netlify/lib/scoped-store.cjs'),{preview}],
  [require.resolve('../../netlify/legacy-functions/storage.js'),{getTokens:async()=>[{item_id:'existing',access_token:'private-test-token',institution:'Test Bank'}]}],
 ])
 const prior=new Map([...mocks].map(([id])=>[id,require.cache[id]]))
 try {
  for(const [id,exports] of mocks)require.cache[id]={id,filename:id,loaded:true,exports}
  delete require.cache[path]
  const endpoint=require(path)
  endpoint.setNativePlaid({Configuration:class{},PlaidApi:class{constructor(){return client}},PlaidEnvironments:{sandbox:'test'}})
  return endpoint.handler
 } finally { delete require.cache[path];for(const [id,old] of prior){if(old)require.cache[id]=old;else delete require.cache[id]} }
}
const request=(body={itemId:'existing'})=>({httpMethod:'POST',headers:{origin:'https://brevity.test',host:'brevity.test','content-type':'application/json'},body:JSON.stringify(body)})
test('reconnection requires authenticated admin, same origin, JSON and existing item',async()=>{
 assert.equal((await install({session:null})(request())).statusCode,401)
 assert.equal((await install({session:{role:'member'}})(request())).statusCode,403)
 assert.equal((await install({preview:true})(request())).statusCode,403)
 assert.equal((await install()({...request(),headers:{...request().headers,origin:'https://evil.test'}})).statusCode,403)
 assert.equal((await install()({...request(),headers:{...request().headers,'content-type':'text/plain'}})).statusCode,415)
 assert.equal((await install()(request({itemId:'unknown'}))).statusCode,404)
 assert.equal((await install()(request({}))).statusCode,404)
 assert.equal((await install()({...request(),body:'invalid'})).statusCode,400)
})
test('update mode sends existing secret only to Plaid; no products, exchange, or storage write',async()=>{
 let input
 const result=await install({client:{linkTokenCreate:async value=>{input=value;return {data:{link_token:'ephemeral-link'}}}}})(request())
 assert.equal(result.statusCode,200)
 assert.equal(input.access_token,'private-test-token')
 assert.equal(input.products,undefined)
 assert.deepEqual(JSON.parse(result.body),{link_token:'ephemeral-link'})
 assert.ok(!result.body.includes('private-test-token'))
})
test('status distinguishes sign-in requirement, successful verification, and unavailable status without secrets',async()=>{
 for(const [client,expected] of [
  [{itemGet:async()=>({data:{item:{error:{error_code:'ITEM_LOGIN_REQUIRED'}}}})}, {code:'ITEM_LOGIN_REQUIRED',verified:true}],
  [{itemGet:async()=>({data:{item:{error:null}}})}, {code:'',verified:true}],
  [{itemGet:async()=>{throw new Error('private-test-token')}}, {code:'STATUS_UNAVAILABLE',verified:false}],
 ]){
  const result=await install({client})({httpMethod:'GET'})
  const body=JSON.parse(result.body)
  assert.equal(body.connections[0].code,expected.code)
  assert.equal(body.connections[0].verified,expected.verified)
  assert.ok(!result.body.includes('private-test-token'))
 }
})
test('provider failures do not disclose secrets',async()=>{
 const result=await install({client:{linkTokenCreate:async()=>{throw new Error('private-test-token')}}})(request())
 assert.equal(result.statusCode,502)
 assert.ok(!result.body.includes('private-test-token'))
})

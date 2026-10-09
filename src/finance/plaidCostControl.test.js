import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { reservePaidCalls, uniqueConnections, COOLDOWN_MS } = require('../../netlify/lib/plaid-cost-control.cjs')
const admin = { role:'admin' }
const tokens = [{ item_id:'one', access_token:'secret' }]
const now = Date.parse('2026-10-09T12:00:00Z')
function memoryStore(initial = null) {
  let data = initial, version = initial ? 1 : 0
  return {
    getWithMetadata:async () => data ? { data:structuredClone(data), etag:String(version) } : null,
    setJSON:async (key, next, condition) => {
      if (condition.onlyIfNew ? data !== null : condition.onlyIfMatch !== String(version)) return { modified:false }
      data = structuredClone(next); version++
      return { modified:true, etag:String(version) }
    },
  }
}
const reserve = (store, extra = {}) => reservePaidCalls({store, session:admin, product:'balance', tokens, now, ...extra})

test('concurrent devices reserve only one paid call and retries stay blocked', async () => {
  const store = memoryStore()
  const results = await Promise.allSettled(Array.from({length:8}, () => reserve(store)))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'PLAID_PAID_COOLDOWN'))
  await assert.rejects(reserve(store, {now:now + COOLDOWN_MS - 1}), {code:'PLAID_PAID_COOLDOWN'})
  assert.equal((await reserve(store, {now:now + COOLDOWN_MS})).monthlyReservedCents, 20)
})

test('both endpoints share a monthly allowance; blocked requests do not reserve', async () => {
  const store = memoryStore({month:'2026-10', reservedCents:490, lastAttempts:{}})
  assert.equal((await reserve(store)).monthlyReservedCents, 500)
  await assert.rejects(reserve(store, {product:'transactions'}), {code:'PLAID_PAID_BUDGET'})
  assert.equal((await store.getWithMetadata()).data.reservedCents, 500)
})

test('UTC month rollover resets allowance but retains cross-month cooldown', async () => {
  const end = Date.parse('2026-10-31T23:59:00Z'), store = memoryStore()
  await reserve(store, {now:end})
  await assert.rejects(reserve(store, {now:end + 120000}), {code:'PLAID_PAID_COOLDOWN'})
  assert.equal((await reserve(store, {now:end + COOLDOWN_MS})).monthlyReservedCents, 10)
})

test('missing storage, missing CAS acknowledgement, damaged ledger and non-admin fail closed', async () => {
  await assert.rejects(reserve(memoryStore(), {session:{role:'member'}}), {code:'PLAID_PAID_FORBIDDEN'})
  for (const store of [
    {getWithMetadata:async()=>{throw new Error('offline')}},
    {getWithMetadata:async()=>null,setJSON:async()=>undefined},
    {getWithMetadata:async()=>({data:{reservedCents:0,lastAttempts:{}},etag:''})},
  ]) await assert.rejects(reserve(store), {code:'PLAID_COST_UNAVAILABLE'})
})

test('duplicate Items and access tokens cannot multiply paid calls', async () => {
  const duplicate = [...tokens, ...tokens, {item_id:'one',access_token:'rotated'}, {item_id:'alias',access_token:'secret'}]
  assert.equal(uniqueConnections(duplicate).length, 1)
  assert.equal((await reserve(memoryStore(), {tokens:duplicate})).reservedCents, 10)
})

test('transaction endpoint refuses paid calls before contacting Plaid', async () => {
  const handlerPath = require.resolve('../../netlify/legacy-functions/plaid-transactions.js')
  const modules = new Map([
    [require.resolve('../../netlify/lib/household-auth.cjs'), {readSession:async()=>admin}],
    [require.resolve('../../netlify/legacy-functions/storage.js'), {getTokens:async()=>tokens}],
    [require.resolve('../../netlify/lib/plaid-cost-control.cjs'), {uniqueConnections,reservePaidCalls:async()=>{throw Object.assign(new Error('Cooldown'),{statusCode:429,code:'PLAID_PAID_COOLDOWN'})}}],
  ])
  const previous = new Map([...modules].map(([path])=>[path,require.cache[path]]))
  const previousHandler = require.cache[handlerPath]
  try {
    for (const [path,exports] of modules) require.cache[path]={id:path,filename:path,loaded:true,exports}
    delete require.cache[handlerPath]
    const endpoint=require(handlerPath)
    let calls=0
    endpoint.setNativePlaid({Configuration:class{},PlaidApi:class{constructor(){return {transactionsRefresh:async()=>{calls++}}}},PlaidEnvironments:{sandbox:'test'}})
    const result=await endpoint.handler({httpMethod:'GET',rawQuery:'refresh=1&refresh_only=1'})
    assert.equal(result.statusCode,429)
    assert.equal(JSON.parse(result.body).code,'PLAID_PAID_COOLDOWN')
    assert.equal(calls,0)
  } finally {
    for (const [path,value] of previous) {if(value)require.cache[path]=value;else delete require.cache[path]}
    if(previousHandler)require.cache[handlerPath]=previousHandler;else delete require.cache[handlerPath]
  }
})

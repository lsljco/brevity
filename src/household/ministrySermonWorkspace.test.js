import test from 'node:test'
import assert from 'node:assert/strict'
import { createMinistrySermonWorkspaceHandler } from '../../netlify/functions/ministry-sermon-workspace.mjs'

test('shared sermon workspace saves a revision and rejects a stale writer', async () => {
  let saved=null
  const dataStore={get:async()=>saved,setJSON:async(_key,value)=>{saved=value}}
  const handler=createMinistrySermonWorkspaceHandler({authenticate:async()=>({member:'Lorenzo'}),dataStoreFactory:()=>dataStore,now:()=>new Date('2026-09-27T18:00:00Z')})
  const initial=JSON.parse((await handler({httpMethod:'GET'})).body)
  assert.equal(initial.revision,0)
  const body={baseRevision:0,series:[{id:'series-1',title:'From Dust to Design'}],sermons:[{id:'sermon-1',seriesId:'series-1',title:'Before You Knew You',assets:[]}]}
  const first=await handler({httpMethod:'PUT',body:JSON.stringify(body)})
  assert.equal(first.statusCode,200)
  assert.equal(JSON.parse(first.body).revision,1)
  const stale=await handler({httpMethod:'PUT',body:JSON.stringify(body)})
  assert.equal(stale.statusCode,409)
  assert.equal(JSON.parse(stale.body).workspace.sermons[0].title,'Before You Knew You')
})

test('the sermon workspace requires a signed-in household member', async () => {
  const handler=createMinistrySermonWorkspaceHandler({authenticate:async()=>null})
  assert.equal((await handler({httpMethod:'GET'})).statusCode,401)
})

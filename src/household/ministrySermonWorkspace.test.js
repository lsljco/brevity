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

test('imports a synchronized Builder Vault sermon once and populates workspace fields',async()=>{
  const records=new Map()
  const dataStore={get:async key=>records.get(key)||null,setJSON:async(key,value)=>records.set(key,value)}
  const handler=createMinistrySermonWorkspaceHandler({authenticate:async()=>({member:'Lorenzo'}),dataStoreFactory:()=>dataStore,now:()=>new Date('2026-09-27T18:00:00Z'),idFactory:(()=>{let n=0;return()=>`id-${++n}`})()})
  records.set('lslj-family/apostolic-members/lorenzo/library',{records:[{id:'s_1',sermon:{series:'Watchfulness',sermon_title:'Found Faithful',big_idea:'Be ready.',opening_setup:'Opening',exposition:'Full exposition'},notes:{scripture_reference:'Mark 13:33'}}]})
  const vault=JSON.parse((await handler({httpMethod:'GET',queryStringParameters:{source:'vault'}})).body)
  assert.equal(vault.records[0].title,'Found Faithful')
  const request={httpMethod:'POST',body:JSON.stringify({source:'vault',recordId:'s_1',baseRevision:0})}
  const imported=JSON.parse((await handler(request)).body)
  assert.equal(imported.workspace.sermons[0].title,'Found Faithful')
  assert.equal(imported.workspace.sermons[0].scripture,'Mark 13:33')
  assert.equal(imported.workspace.series[0].title,'Watchfulness')
  assert.equal(imported.workspace.sermons[0].approvedNotes,'')
  const duplicate=JSON.parse((await handler({...request,body:JSON.stringify({source:'vault',recordId:'s_1',baseRevision:1})})).body)
  assert.equal(duplicate.alreadyImported,true)
  assert.equal(duplicate.workspace.sermons.length,1)
})

test('imports pasted text and a Builder JSON file while enforcing revisions',async()=>{
  let saved=null
  const dataStore={get:async()=>saved,setJSON:async(_key,value)=>{saved=value}}
  const handler=createMinistrySermonWorkspaceHandler({authenticate:async()=>({member:'Lorenzo'}),dataStoreFactory:()=>dataStore,idFactory:(()=>{let n=0;return()=>`import-${++n}`})()})
  const paste=await handler({httpMethod:'POST',body:JSON.stringify({source:'paste',baseRevision:0,rawText:'A Faithful Witness\n\nOpening paragraph.'})})
  assert.equal(paste.statusCode,200)
  assert.equal(saved.sermons[0].title,'A Faithful Witness')
  assert.equal(saved.sermons[0].outline,'A Faithful Witness\n\nOpening paragraph.')
  const stale=await handler({httpMethod:'POST',body:JSON.stringify({source:'file',baseRevision:0,sermon:{sermon_title:'Second Sermon'}})})
  assert.equal(stale.statusCode,409)
  const file=await handler({httpMethod:'POST',body:JSON.stringify({source:'file',baseRevision:1,sourceName:'sermon.json',sermon:{sermon_title:'Second Sermon',exposition:'Full text'},notes:{scripture_reference:'Acts 2:38'}})})
  assert.equal(file.statusCode,200)
  assert.equal(saved.sermons[0].scripture,'Acts 2:38')
  assert.equal(saved.sermons[0].outline,'Exposition\nFull text')
  assert.equal(saved.sermons.length,2)
})

test('does not allow a member to list or import another member’s Vault',async()=>{
  const handler=createMinistrySermonWorkspaceHandler({authenticate:async()=>({member:'Lorenzo',role:'member'}),dataStoreFactory:()=>({get:async()=>null})})
  assert.equal((await handler({httpMethod:'GET',queryStringParameters:{source:'vault',member:'Larry'}})).statusCode,403)
  assert.equal((await handler({httpMethod:'POST',body:JSON.stringify({source:'vault',vaultMember:'Larry',recordId:'s_1',baseRevision:0})})).statusCode,403)
})

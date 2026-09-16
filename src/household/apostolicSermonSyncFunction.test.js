import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createApostolicSermonsHandler } from '../../netlify/functions/apostolic-sermons.mjs'

function memoryStore(seed={}) {
  const values=new Map(Object.entries(seed))
  return {
    values,
    async get(key){return values.get(key) ?? null},
    async setJSON(key,value){values.set(key,value)},
  }
}

test('sermon libraries are isolated by authenticated member and persist across requests',async()=>{
  const dataStore=memoryStore()
  const handlerFor=member=>createApostolicSermonsHandler({authenticate:async()=>({member}),dataStoreFactory:()=>dataStore,now:()=>new Date('2026-08-30T18:00:00.000Z')})
  const save=await handlerFor('Lorenzo')({httpMethod:'PUT',body:JSON.stringify({baseRevision:0,records:[{id:'s-1',sermon:{sermon_title:'Order'}}],subfolders:{drafts:[]}})})
  assert.equal(save.statusCode,200)
  const lorenzo=JSON.parse((await handlerFor('Lorenzo')({httpMethod:'GET'})).body)
  const larry=JSON.parse((await handlerFor('Larry')({httpMethod:'GET'})).body)
  assert.equal(lorenzo.records[0].sermon.sermon_title,'Order')
  assert.deepEqual(larry.records,[])
})

test('stale device writes receive the current cloud library instead of overwriting it',async()=>{
  const dataStore=memoryStore()
  const handler=createApostolicSermonsHandler({authenticate:async()=>({member:'Lorenzo'}),dataStoreFactory:()=>dataStore})
  await handler({httpMethod:'PUT',body:JSON.stringify({baseRevision:0,records:[{id:'s-1'}]})})
  const conflict=await handler({httpMethod:'PUT',body:JSON.stringify({baseRevision:0,records:[{id:'s-2'}]})})
  assert.equal(conflict.statusCode,409)
  assert.equal(JSON.parse(conflict.body).library.records[0].id,'s-1')
})

test('Lorenzo first load migrates preserved device-rescue sermons into his account library',async()=>{
  const household='lslj-family'
  const dataStore=memoryStore({
    [`${household}/apostolic-device-imports/sermons`]:[{fingerprint:'abc'}],
    [`${household}/apostolic-device-imports/records/abc`]:{id:'legacy-1',sermon:{sermon_title:'Recovered Teaching'}},
  })
  const handler=createApostolicSermonsHandler({authenticate:async()=>({member:'Lorenzo'}),dataStoreFactory:()=>dataStore,now:()=>new Date('2026-08-30T18:00:00.000Z')})
  const response=await handler({httpMethod:'GET'})
  const library=JSON.parse(response.body)
  assert.equal(library.records[0].sermon.sermon_title,'Recovered Teaching')
  assert.equal(library.migratedFromDeviceRescue,true)
})

test('device rescues imported by another member seed only that member library',async()=>{
  const household='lslj-family'
  const dataStore=memoryStore({
    [`${household}/apostolic-device-imports/index`]:[{checksum:'nyla-export',importedBy:'Nyla'}],
    [`${household}/apostolic-device-imports/sermons`]:[{fingerprint:'nyla-record',sourceExportChecksums:['nyla-export']}],
    [`${household}/apostolic-device-imports/records/nyla-record`]:{id:'nyla-1',sermon:{sermon_title:'Nyla Teaching'}},
  })
  const handlerFor=member=>createApostolicSermonsHandler({authenticate:async()=>({member}),dataStoreFactory:()=>dataStore})
  const nyla=JSON.parse((await handlerFor('Nyla')({httpMethod:'GET'})).body)
  const javin=JSON.parse((await handlerFor('Javin')({httpMethod:'GET'})).body)
  assert.equal(nyla.records[0].sermon.sermon_title,'Nyla Teaching')
  assert.deepEqual(javin.records,[])
})

test('Brevity opens the same-origin builder and every local library save schedules account sync',()=>{
  const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8')
  const builder=readFileSync(new URL('../../public/apostolic-builder/index.html',import.meta.url),'utf8')
  assert.match(app,/url:'\/apostolic-builder\/'/)
  assert.match(builder,/const APOSTOLIC_CLOUD_ENDPOINT = '\/\.netlify\/functions\/apostolic-sermons'/)
  assert.match(builder,/function librarySaveAll\(records\)[\s\S]*scheduleApostolicCloudSave\(\)/)
  assert.match(builder,/fetch\(APOSTOLIC_CLOUD_ENDPOINT,\{credentials:'include'\}\)/)
})

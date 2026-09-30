import test from 'node:test'
import assert from 'node:assert/strict'
import {createConversationRepository,pruneConversationStore} from '../../netlify/lib/assistant-conversation-store.mjs'
import {createConversationHandler} from '../../netlify/functions/brevity-conversation.mjs'
function fixture(){
 const values=new Map();let sequence=0
 const store={async getWithMetadata(key){return structuredClone(values.get(key)||null)},async setJSON(key,data,options={}){const before=values.get(key);if(options.onlyIfNew&&before||options.onlyIfMatch&&before?.etag!==options.onlyIfMatch)return {modified:false};values.set(key,{data:structuredClone(data),etag:String(++sequence)});return {modified:true}},async *list(){yield {blobs:[...values.keys()].map(key=>({key}))}}}
 let time=new Date('2026-09-29T10:00:00Z')
 return {values,store,repository:createConversationRepository({store,now:()=>time}),advance:days=>{time=new Date(time.getTime()+days*86400000)},now:()=>time}
}
const turn=(version=0,turnId='one')=>({version,turnId,user:{role:'user',content:'I had a meal'},assistant:{role:'assistant',content:'Which quantity?'}})
test('saved-task links survive reload, clear/restore and receipt retry without leaking to another member',async()=>{
 const f=fixture(),taskLinks=[{id:'task-1',date:'2026-10-01',title:'Inspect garage',owner:'Larry'}]
 await f.repository.appendReceipt('Larry',{id:'receipt-task',content:'Saved task.',taskLinks})
 await f.repository.appendReceipt('Larry',{id:'receipt-task',content:'Duplicate.',taskLinks})
 let value=await f.repository.read('Larry');assert.equal(value.messages.length,1);assert.deepEqual(value.messages[0].taskLinks,taskLinks)
 await f.repository.clear('Larry',value.version);value=await f.repository.read('Larry');await f.repository.restore('Larry',value.version)
 assert.deepEqual((await f.repository.read('Larry')).messages[0].taskLinks,taskLinks)
 assert.deepEqual((await f.repository.read('Lorenzo')).messages,[])
})
test('conversations persist across repository instances and isolate members and households',async()=>{
 const f=fixture();await f.repository.appendTurn('Larry',turn())
 assert.equal((await createConversationRepository({store:f.store,now:f.now}).read('Larry')).messages.length,2)
 assert.equal((await f.repository.read('Lorenzo')).messages.length,0)
 assert.equal((await createConversationRepository({store:f.store,householdId:'other'}).read('Larry')).messages.length,0)
})
test('conversation retries are idempotent; concurrent devices cannot overwrite a turn',async()=>{
 const f=fixture();await f.repository.appendTurn('Larry',turn());await f.repository.appendTurn('Larry',turn())
 assert.equal((await f.repository.read('Larry')).messages.length,2)
 await assert.rejects(()=>f.repository.appendTurn('Larry',turn(0,'two')),error=>error.status===409)
 await f.repository.appendTurn('Larry',turn(1,'two'));assert.equal((await f.repository.read('Larry')).messages.length,4)
})
test('clear changes the version, supports seven-day recovery and blocks stale in-flight replies',async()=>{
 const f=fixture();await f.repository.appendTurn('Larry',turn());const cleared=await f.repository.clear('Larry',1)
 assert.equal(cleared.messages.length,0);assert.equal(cleared.canRestore,true);assert.equal(cleared.archive,undefined)
 await assert.rejects(()=>f.repository.appendTurn('Larry',turn(1,'late')),error=>error.status===409)
 assert.equal((await f.repository.restore('Larry',2)).messages.length,2)
 await f.repository.clear('Larry',3);f.advance(8);assert.equal((await f.repository.read('Larry')).canRestore,false)
 await assert.rejects(()=>f.repository.restore('Larry',4),/No recently/)
 await pruneConversationStore(f.store,f.now());assert.equal([...f.values.values()][0].data.archive,undefined)
})
test('thirty-day retention removes expired text from reads and persisted storage',async()=>{
 const f=fixture();await f.repository.appendTurn('Larry',turn());f.advance(31)
 assert.equal((await f.repository.read('Larry')).messages.length,0)
 await pruneConversationStore(f.store,f.now());assert.deepEqual([...f.values.values()][0].data.messages,[])
})
test('conversation HTTP controls bind to session identity, never a supplied member',async()=>{
 const f=fixture();await f.repository.appendTurn('Larry',turn())
 const handler=createConversationHandler({readSession:async()=>({member:'Lorenzo'}),repository:()=>f.repository})
 const result=await handler({httpMethod:'POST',body:JSON.stringify({action:'clear',version:0,member:'Larry'})})
 assert.equal(result.statusCode,200);assert.equal((await f.repository.read('Larry')).messages.length,2)
 const denied=createConversationHandler({readSession:async()=>null});assert.equal((await denied({httpMethod:'GET'})).statusCode,401)
})

test('completed action receipts persist with chat and are retry-safe',async()=>{
 const f=fixture();await f.repository.appendTurn('Larry',turn())
 await f.repository.appendReceipt('Larry',{id:'action-one',content:'Completed: fixture walk.'})
 const value=await f.repository.appendReceipt('Larry',{id:'action-one',content:'Completed: fixture walk.'})
 assert.equal(value.messages.length,3);assert.equal(value.messages.at(-1).content,'Completed: fixture walk.');assert.equal(value.receiptIds,undefined)
})

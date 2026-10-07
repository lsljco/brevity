import test from 'node:test'
import assert from 'node:assert/strict'
import {createMeetingRecordingsHandler} from '../../netlify/functions/meeting-recordings.mjs'
const records=new Map()
const store={getWithMetadata:async key=>records.has(key)?{data:records.get(key),etag:'test'}:null,get:async key=>records.get(key)||null,setJSON:async(key,value,options)=>{if(!options?.onlyIfNew||!records.has(key))records.set(key,value)},list:async({prefix})=>({blobs:[...records.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))})}
const handler=member=>createMeetingRecordingsHandler({authenticate:async()=>member?{member}:null,storeFactory:()=>store})
const id='00000000-1111-2222-3333-444444444444'
const call=(member,httpMethod,queryStringParameters={},body='')=>handler(member)({httpMethod,queryStringParameters,body,headers:{'content-type':'audio/webm'}})
test('recordings retain audio and transcripts and are private to the recording member',async()=>{
 records.clear()
 const meta={date:'2026-10-07',startedAt:'2026-10-07T08:00:00Z',updatedAt:'2026-10-07T08:01:00Z',transcript:'Keep the recorded words.',notes:'Review meals',status:'stopped',chunkCount:1,mime:'audio/webm'}
 assert.equal((await call(null,'GET')).statusCode,401)
 assert.equal((await call('Larry','POST',{id,chunk:'0'},'original-audio')).statusCode,200)
 assert.equal((await call('Larry','POST',{id,chunk:'0'},'replacement-audio')).statusCode,200)
 assert.equal((await call('Larry','PUT',{id},JSON.stringify(meta))).statusCode,200)
 assert.equal(JSON.parse((await call('Larry','GET',{id})).body).record.transcript,meta.transcript)
 assert.deepEqual(JSON.parse((await call('Larry','GET',{id})).body).chunks,[0])
 assert.equal(Buffer.from((await call('Larry','GET',{id,chunk:'0'})).body,'base64').toString(),'original-audio')
 assert.equal((await call('Terica','GET',{id})).statusCode,404)
 assert.equal((await call('Terica','GET',{id,chunk:'0'})).statusCode,404)
 assert.deepEqual(JSON.parse((await call('Terica','GET')).body).meetings,[])
 assert.equal(JSON.parse((await call('Larry','GET')).body).meetings.length,1)
})
test('recordings reject traversal, invalid chunks, empty audio and unsupported writes',async()=>{
 assert.equal((await call('Larry','GET',{id:'../other'})).statusCode,400)
 assert.equal((await call('Larry','POST',{id,chunk:'-1'},'audio')).statusCode,400)
 assert.equal((await call('Larry','POST',{id,chunk:'0'},'')).statusCode,413)
 assert.equal((await call('Larry','PUT',{id},'not json')).statusCode,400)
 assert.equal((await call('Larry','DELETE',{id})).statusCode,405)
 assert.equal((await call('Terica','POST',{id,chunk:'0',member:'Larry'},'private audio')).statusCode,403)
})
test('an older retry cannot overwrite a newer saved transcript',async()=>{
 records.clear()
 const base={date:'2026-10-07',startedAt:'2026-10-07T08:00:00Z',status:'stopped'}
 await call('Larry','PUT',{id},JSON.stringify({...base,updatedAt:'2026-10-07T09:00:00Z',transcript:'The complete transcript'}))
 await call('Larry','PUT',{id},JSON.stringify({...base,updatedAt:'2026-10-07T08:30:00Z',transcript:'Earlier partial'}))
 assert.equal(JSON.parse((await call('Larry','GET',{id})).body).record.transcript,'The complete transcript')
})

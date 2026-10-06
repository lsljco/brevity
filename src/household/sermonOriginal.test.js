import test from 'node:test'
import assert from 'node:assert/strict'
import { originalSourceHash, retainOriginalWord, originalKey } from '../../netlify/lib/sermon-original.mjs'
import { createSermonOriginalHandler } from '../../netlify/functions/sermon-original.mjs'
import { createSermonNotesImportHandler } from '../../netlify/functions/sermon-notes-import.mjs'
import { buildTimesSermonDocx } from '../../netlify/lib/sermon-times-documents.mjs'

const memory=()=>{const records=new Map();return {records,async get(key){return records.get(key)||null},async setJSON(key,value,{onlyIfNew}={}){if(onlyIfNew&&records.has(key))return {modified:false};records.set(key,value);return {modified:true}}}}
const text='A reviewed teaching source.\n\nPractice the Word.'
test('original Word bytes are immutable and keyed by the same cleaned source used for review',async()=>{
 const store=memory(),buffer=Buffer.from('original bytes')
 const retained=await retainOriginalWord({buffer,text,fileName:'Teaching.docx',member:'Larry',store})
 assert.equal(retained.sourceHash,originalSourceHash('  A reviewed teaching source.\r\n\r\nPractice the Word.  '))
 assert.equal(store.records.get(originalKey(retained.sourceHash)).data,buffer.toString('base64'))
 await retainOriginalWord({buffer,text,fileName:'Teaching.docx',member:'Larry',store})
 await assert.rejects(retainOriginalWord({buffer:Buffer.from('changed formatting'),text,fileName:'Changed.docx',member:'Larry',store}),/has not been replaced/)
 assert.equal(store.records.size,1)
})
test('original drafts stay private until their exact source is active, and GET never activates them',async()=>{
 const store=memory(),sourceHash=originalSourceHash(text)
 await retainOriginalWord({buffer:Buffer.from('original bytes'),text,fileName:'Teaching.docx',member:'Larry',store})
 let member='Larry',version=0,activeHash='b'.repeat(64)
 const handler=createSermonOriginalHandler({store,readSession:async()=>member?{member}:null,repository:{active:async()=>({version,value:{source:{sourceHash:activeHash}}})}})
 const event={httpMethod:'GET',queryStringParameters:{sourceHash}}
 assert.equal((await handler(event)).statusCode,200)
 member='Terica';assert.equal((await handler(event)).statusCode,404)
 version=1;activeHash=sourceHash
 const allowed=await handler({...event,queryStringParameters:{sourceHash,download:'1'}})
 assert.equal(allowed.statusCode,200)
 assert.equal(Buffer.from(allowed.body,'base64').toString(),'original bytes')
 assert.equal(allowed.headers['cache-control'],'private, no-store')
 activeHash='b'.repeat(64);assert.equal((await handler(event)).statusCode,404)
 member=null;assert.equal((await handler(event)).statusCode,401)
 assert.equal((await handler({...event,httpMethod:'POST'})).statusCode,405)
 assert.equal(store.records.size,1)
})
test('Word import retains original formatting only with existing planning permission',async()=>{
 const bytes=await buildTimesSermonDocx({documentTitle:'A teaching source',openingExhortation:['A substantial original Word teaching paragraph that remains available as a formatted reading document after review.']},{})
 let canPlan=false,retained=null
 const handler=createSermonNotesImportHandler({readSessionFn:async()=>({member:'Terica',role:'member'}),actionRepository:{getPermissions:async()=>({Terica:{planning:canPlan}})},retainWord:async input=>{retained=input;return {sourceHash:originalSourceHash(input.text)}}})
 const event={httpMethod:'POST',body:JSON.stringify({name:'Teaching.docx',data:bytes.toString('base64')})}
 const readOnly=await handler(event)
 assert.equal(readOnly.statusCode,200);assert.equal(retained,null)
 canPlan=true
 const allowed=await handler(event)
 assert.equal(allowed.statusCode,200)
 assert.deepEqual(retained.buffer,bytes)
 assert.equal(retained.member,'Terica')
 assert.equal(JSON.parse(allowed.body).originalDocument.sourceHash,originalSourceHash(JSON.parse(allowed.body).text))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSermonIdentitiesHandler } from '../../netlify/functions/sermon-identities.mjs'

const jpeg=Buffer.concat([Buffer.from([255,216]),Buffer.alloc(100),Buffer.from([255,217])])
test('sermon identity uploads require an admin and remain in private storage',async()=>{
 let saved
 const handler=createSermonIdentitiesHandler({authenticate:async()=>({member:'Larry',role:'admin'}),storeFactory:()=>({set:async(key,bytes)=>{saved={key,bytes}},setJSON:async()=>{},get:async()=>saved?.bytes})})
 const upload={httpMethod:'PUT',body:JSON.stringify({member:'Terica',imageBase64:jpeg.toString('base64')})}
 assert.equal((await handler(upload)).statusCode,200)
 assert.match(saved.key,/Terica\.jpg$/)
 assert.deepEqual(Buffer.from(saved.bytes),jpeg)
 assert.equal((await handler({httpMethod:'GET'})).statusCode,200)
 assert.equal((await handler({...upload,body:JSON.stringify({member:'Unknown',imageBase64:jpeg.toString('base64')})})).statusCode,400)
 const nonAdmin=createSermonIdentitiesHandler({authenticate:async()=>({member:'Lorenzo',role:'member'})})
 assert.equal((await nonAdmin(upload)).statusCode,403)
})

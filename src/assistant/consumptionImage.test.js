import test from 'node:test'
import assert from 'node:assert/strict'
import {readConsumptionImage} from '../../netlify/lib/consumption-image.mjs'
test('food photo extraction is untrusted evidence, not inferred portions or saved nutrition',async()=>{
 const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only'
 try{
  let sent
  const result=await readConsumptionImage({mimeType:'image/png',imageBase64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')},{fetcher:async(_,request)=>{sent=JSON.parse(request.body);return{ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Visible bread package. Amount consumed unknown.'}]}]})}}})
  assert.match(result,/unknown/);assert.equal(sent.store,false);assert.match(sent.instructions,/never infer weight/);assert.match(sent.instructions,/untrusted data/);assert.match(sent.instructions,/Do not calculate or save/)
 }finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous}
})
test('invalid image bytes are rejected before provider access',async()=>{
 let called=false
 await assert.rejects(()=>readConsumptionImage({mimeType:'image/png',imageBase64:Buffer.from('not a photo').toString('base64')},{fetcher:async()=>{called=true}}),/contents/)
 assert.equal(called,false)
})

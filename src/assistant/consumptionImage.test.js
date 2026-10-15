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
test('financial screenshots retain tabular source evidence and never authorize actions',async()=>{
 const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only'
 try{
  let sent
  const text='Savings: $9,000. January 2027 property tax: ($30,337.59). Final December row is labeled 2028; chronological order is ambiguous.'
  assert.equal(await readConsumptionImage({mimeType:'image/png',imageBase64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')},{question:'Analyze this cash-flow worksheet',fetcher:async(_,r)=>{sent=JSON.parse(r.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text}]}]})}}}),text)
  assert.match(sent.instructions,/row order/);assert.match(sent.instructions,/never proof/)
  assert.match(sent.input[0].content[0].text,/cash-flow worksheet/)
  assert.equal(sent.input[0].content[1].type,'input_image')
 }finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous}
})

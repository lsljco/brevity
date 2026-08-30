import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSermonFormation } from './sermonFormationApi.js'

test('every sermon generation uses the background job path, including short notes', async t => {
  const originalFetch=globalThis.fetch
  const calls=[]
  globalThis.fetch=async (url,options={})=>{
    calls.push({url,options})
    if(String(url).includes('sermon-formation-background'))return new Response('',{status:202})
    return new Response(JSON.stringify({state:'ready',result:{generatedAt:'2026-08-30T00:00:00.000Z',sermonNotes:{documentTitle:'Test'},formation:{}}}),{status:200,headers:{'content-type':'application/json'}})
  }
  t.after(()=>{globalThis.fetch=originalFetch})

  const result=await generateSermonFormation({transcript:'Short existing sermon notes',sourceKind:'notes'})

  assert.equal(result.sermonNotes.documentTitle,'Test')
  assert.match(calls[0].url,/sermon-formation-background$/)
  assert.match(calls[1].url,/sermon-formation-status\?jobId=/)
  assert.equal(calls.some(call=>/sermon-formation$/.test(call.url)),false)
})

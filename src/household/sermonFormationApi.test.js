import assert from 'node:assert/strict'
import test from 'node:test'
import { clearPendingSermonAnalysis, generateSermonFormation, getPendingSermonAnalysis, resumeSermonFormation, SERMON_ANALYSIS_RESUME_KEY } from './sermonFormationApi.js'

function memoryStorage(){
  const values=new Map()
  return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}
}

test('every sermon generation uses the background job path, including short notes', async t => {
  const originalFetch=globalThis.fetch
  const calls=[]
  globalThis.fetch=async (url,options={})=>{
    calls.push({url,options})
    if(String(url).includes('sermon-formation-start'))return new Response(JSON.stringify({jobId:'sermon-job-one'}),{status:202,headers:{'content-type':'application/json'}})
    return new Response(JSON.stringify({state:'ready',result:{generatedAt:'2026-08-30T00:00:00.000Z',sermonNotes:{documentTitle:'Test'},formation:{}}}),{status:200,headers:{'content-type':'application/json'}})
  }
  t.after(()=>{globalThis.fetch=originalFetch})

  const result=await generateSermonFormation({transcript:'Short existing sermon notes',sourceKind:'notes'})

  assert.equal(result.sermonNotes.documentTitle,'Test')
  assert.match(calls[0].url,/sermon-formation-start$/)
  assert.match(calls[1].url,/sermon-formation-status\?jobId=/)
  assert.equal(JSON.parse(calls[0].options.body).sourceKind,'notes')
  assert.equal(calls.some(call=>/sermon-formation-background$/.test(call.url)),false)
  assert.equal(calls.some(call=>/sermon-formation$/.test(call.url)),false)
})

test('sermon analysis resumes across navigation without storing the uploaded transcript',async t=>{
  const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage
  const storage=memoryStorage();globalThis.localStorage=storage
  let statuses=0
  globalThis.fetch=async url=>{
    if(String(url).includes('sermon-formation-start'))return new Response(JSON.stringify({jobId:'sermon-job-resume',sourceHash:'a'.repeat(64),baseActiveVersion:2}),{status:202,headers:{'content-type':'application/json'}})
    statuses+=1
    return new Response(JSON.stringify({state:'ready',result:{draftId:'draft-one',sourceHash:'a'.repeat(64),baseActiveVersion:2,sermonNotes:{documentTitle:'Retained candidate'},formation:{todayFocus:'Grow'}}}),{status:200,headers:{'content-type':'application/json'}})
  }
  t.after(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage})
  const generated=await generateSermonFormation({transcript:'Private uploaded sermon words',fileName:'sermon.docx',pollIntervalMs:0})
  assert.equal(generated.sermonNotes.documentTitle,'Retained candidate')
  const persisted=storage.getItem(SERMON_ANALYSIS_RESUME_KEY)
  assert.ok(persisted)
  assert.doesNotMatch(persisted,/Private uploaded sermon words/)
  assert.equal(getPendingSermonAnalysis().context.fileName,'sermon.docx')
  const resumed=await resumeSermonFormation({pollIntervalMs:0})
  assert.equal(resumed.draftId,'draft-one')
  assert.equal(statuses,2)
  clearPendingSermonAnalysis()
  assert.equal(getPendingSermonAnalysis(),null)
})

test('stalled and failed retained analyses have safe requeue and explicit retry paths',async t=>{
  const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage
  const storage=memoryStorage();globalThis.localStorage=storage
  storage.setItem(SERMON_ANALYSIS_RESUME_KEY,JSON.stringify({jobId:'sermon-job-retry',context:{title:'Retained'}}))
  const calls=[]
  let statusIndex=0
  globalThis.fetch=async (url,options={})=>{
    calls.push({url:String(url),options})
    if(String(url).includes('sermon-formation-start'))return new Response(JSON.stringify({accepted:true,jobId:'sermon-job-retry'}),{status:202,headers:{'content-type':'application/json'}})
    statusIndex+=1
    const body=statusIndex===1?{state:'stalled',retryable:true,reason:'worker expired'}:{state:'ready',result:{draftId:'draft-retry',sermonNotes:{documentTitle:'Recovered'},formation:{}}}
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}})
  }
  t.after(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage})
  const result=await resumeSermonFormation({pollIntervalMs:0})
  assert.equal(result.sermonNotes.documentTitle,'Recovered')
  const requeue=calls.find(call=>call.url.includes('sermon-formation-start'))
  assert.deepEqual(JSON.parse(requeue.options.body),{jobId:'sermon-job-retry',restart:false})

  storage.setItem(SERMON_ANALYSIS_RESUME_KEY,JSON.stringify({jobId:'sermon-job-terminal',context:{}}))
  globalThis.fetch=async (url,options={})=>{
    if(String(url).includes('sermon-formation-start'))return new Response(JSON.stringify({accepted:true,jobId:'sermon-job-terminal'}),{status:202,headers:{'content-type':'application/json'}})
    return new Response(JSON.stringify({state:'error',retryable:true,error:'worker failed'}),{status:200,headers:{'content-type':'application/json'}})
  }
  await assert.rejects(resumeSermonFormation({pollIntervalMs:0}),/worker failed/)
  assert.equal(getPendingSermonAnalysis().jobId,'sermon-job-terminal')
})

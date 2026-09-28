import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSermonCoverPrompt,generateSermonCover,coverJobKey } from '../../netlify/lib/sermon-cover.mjs'
import { createSermonCoverHandler } from '../../netlify/functions/sermon-cover.mjs'
import { createSermonCoverBackgroundHandler } from '../../netlify/functions/sermon-cover-background.mjs'

const sermon={id:'sermon-1',title:'From Dust to Design',bigIdea:'God forms purpose from ordinary soil',scripture:'Genesis 2:7',outline:'The potter shapes the clay.'}
const workspace={sermons:[sermon]}
const png=Buffer.from([137,80,78,71,13,10,26,10,1,2])

test('cover generation requests a photographic, text-free theme and stores PNG bytes',async()=>{
  let prompt='',saved
  const fetcher=async(_url,options)=>{prompt=JSON.parse(options.body).prompt;return{ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]})}}
  const image=await generateSermonCover({sermon,assetId:'asset-1',householdId:'home',store:{set:async(_key,bytes)=>{saved=bytes}},fetcher,apiKey:'test'})
  assert.match(prompt,/From Dust to Design/)
  assert.match(prompt,/photorealistic/)
  assert.match(prompt,/No text/)
  assert.equal(image,'/.netlify/functions/sermon-cover?assetId=asset-1')
  assert.deepEqual(saved,png)
})

test('cover job is queued for a saved sermon and reused while running',async()=>{
  let job,dispatches=0
  const handler=createSermonCoverHandler({authenticate:async()=>({member:'Lorenzo'}),repositoryFactory:()=>({get:async()=>workspace}),jobFactory:()=>({get:async()=>job,setJSON:async(_key,value)=>{job=value}}),dispatch:async()=>{dispatches++;return{ok:true,status:202}}})
  const request={httpMethod:'POST',headers:{host:'example.test'},body:JSON.stringify({sermonId:'sermon-1'})}
  const first=await handler(request),second=await handler(request)
  assert.equal(first.statusCode,202)
  assert.equal(second.statusCode,202)
  assert.equal(dispatches,1)
  assert.equal(job.sermonId,'sermon-1')
})

test('background job stores the finished cover and protects the source version',async()=>{
  let job={id:'job-1',sermonId:'sermon-1',assetId:'asset-1',sourceHash:'stale',requestedBy:'Lorenzo',state:'queued'}
  const jobs={get:async()=>job,setJSON:async(_key,value)=>{job=value}}
  const handler=createSermonCoverBackgroundHandler({authenticate:async()=>({member:'Lorenzo'}),repository:{get:async()=>workspace},jobStore:jobs,generateImage:async()=>{throw Error('Should not generate')}})
  const request=new Request('https://example.test',{method:'POST',body:JSON.stringify({sermonId:'sermon-1',jobId:'job-1'})})
  assert.equal((await handler(request)).status,409)
  assert.equal(job.state,'error')
  assert.match(coverJobKey('home','sermon-1'),/sermon-1/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { sermonSourceHash,sermonJobId,normalizePackage,applyPackage,buildWorkspaceDeck,workspaceKey,packageKey,deckKey } from '../../netlify/lib/sermon-workspace-package.mjs'
import { createSermonWorkspacePackageHandler } from '../../netlify/functions/sermon-workspace-package.mjs'
import { createSermonWorkspacePackageBackgroundHandler } from '../../netlify/functions/sermon-workspace-package-background.mjs'
const sermon={id:'sermon-one',title:'Watch and Pray',bigIdea:'Be ready',scripture:'Mark 13:33',outline:'Watch and pray. '.repeat(20),sourceNotes:'',version:1,assets:[],status:'Draft'}
const draft={notes:'Teaching notes. '.repeat(40),quotes:[{text:'Watch and pray.',sourceExcerpt:'Watch and pray.'}],slides:[{title:'Watchfulness',body:'We remain ready.',scripture:'Mark 13:33'},{title:'Prayer',body:'Turn to God.',scripture:''}],posts:[{idea:'Watchfulness',caption:'Watch and pray. The call to readiness begins with attention to today. What responsibility can you carry faithfully while you wait?',sourceExcerpt:'Watch and pray.'},{idea:'Prayer',caption:'Prayer turns our attention back to God. Watch and pray. Let awareness lead you to dependence and a faithful response today.',sourceExcerpt:'Watch and pray.'}]}
const dataStore=()=>{const records=new Map([[workspaceKey,{schemaVersion:1,revision:0,sermons:[sermon],series:[]}]]);return {records,get:async(key)=>records.get(key)||null,setJSON:async(key,value)=>records.set(key,value),set:async(key,value)=>records.set(key,value)}}
test('normalizes and attaches a source-bound package as draft assets without approving notes',()=>{
 const sourceHash=sermonSourceHash(sermon),id=sermonJobId(sermon.id,sourceHash),status={id,sourceHash,package:normalizePackage(draft)}
 const applied=applyPackage({revision:0,sermons:[sermon],series:[]},sermon.id,status,'Larry')
 assert.equal(applied.sermons[0].generatedNotes,draft.notes.trim())
 assert.equal(applied.sermons[0].approvedNotes,undefined)
 assert.equal(applied.sermons[0].assets.length,5)
 assert.ok(applied.sermons[0].assets.every(asset=>asset.status==='Draft'))
 assert.deepEqual(applied.sermons[0].assets.filter(asset=>asset.type==='facebook').map(asset=>asset.content),draft.posts.map(post=>post.caption))
 assert.equal(applyPackage(applied,sermon.id,status,'Larry'),applied)
 assert.throws(()=>applyPackage({...applied,sermons:[{...sermon,outline:'changed'}]},sermon.id,status,'Larry'),/changed/)
 assert.ok(sermonJobId('x'.repeat(100),sourceHash).length<=100)
})
test('queues, generates, applies, and downloads a slide deck from the saved sermon',async()=>{
 const data=dataStore(),member={member:'Larry',role:'admin'},auth=async()=>member
 const handler=createSermonWorkspacePackageHandler({authenticate:auth,dataStoreFactory:()=>data,dispatch:async()=>({ok:true,status:202})})
 const start=JSON.parse((await handler({httpMethod:'POST',body:JSON.stringify({action:'start',sermonId:sermon.id,baseRevision:0}),headers:{host:'example.test'}})).body)
 assert.equal(start.state,'queued')
 const pending=JSON.parse((await handler({httpMethod:'GET',queryStringParameters:{sermonId:sermon.id}})).body)
 assert.equal(pending.id,start.id)
 const worker=createSermonWorkspacePackageBackgroundHandler({authenticate:auth,dataStoreFactory:()=>data,apiKey:'test-key',fetchFn:async()=>new Response(JSON.stringify({output:[{content:[{text:JSON.stringify(draft)}]}]}),{status:200}),makeDeck:async()=>Buffer.from('deck')})
 const job=await worker(new Request('https://example.test',{method:'POST',headers:{cookie:'session=ok'},body:JSON.stringify({id:start.id})}))
 assert.equal(job.status,202)
 assert.equal(data.records.get(packageKey(start.id)).state,'ready')
 const apply=await handler({httpMethod:'POST',body:JSON.stringify({action:'apply',sermonId:sermon.id,jobId:start.id,baseRevision:0})})
 assert.equal(apply.statusCode,200)
 assert.equal(data.records.get(workspaceKey).sermons[0].assets.length,5)
 assert.equal((await handler({httpMethod:'POST',body:JSON.stringify({action:'apply',sermonId:sermon.id,jobId:start.id,baseRevision:0})})).statusCode,409)
 assert.equal((await handler({httpMethod:'GET',queryStringParameters:{download:start.id}})).body,Buffer.from('deck').toString('base64'))
 assert.equal(data.records.get(deckKey(start.id)).toString(),'deck')
})
test('rejects unverified mic drops and retains an error for retry',async()=>{
 const data=dataStore(),auth=async()=>({member:'Larry'})
 const handler=createSermonWorkspacePackageHandler({authenticate:auth,dataStoreFactory:()=>data,dispatch:async()=>({ok:true,status:202})})
 const start=JSON.parse((await handler({httpMethod:'POST',body:JSON.stringify({action:'start',sermonId:sermon.id,baseRevision:0}),headers:{host:'example.test'}})).body)
 const worker=createSermonWorkspacePackageBackgroundHandler({authenticate:auth,dataStoreFactory:()=>data,apiKey:'test-key',fetchFn:async()=>new Response(JSON.stringify({output:[{content:[{text:JSON.stringify({...draft,quotes:[{text:'Invented line',sourceExcerpt:'Invented line'}]})}]}]}),{status:200}),makeDeck:async()=>Buffer.from('deck')})
 await worker(new Request('https://example.test',{method:'POST',body:JSON.stringify({id:start.id})}))
 assert.equal(data.records.get(packageKey(start.id)).state,'error')
 assert.equal(data.records.get(workspaceKey).revision,0)
})
test('rejects a Facebook draft whose core idea cannot be tied to the saved sermon',async()=>{
 const data=dataStore(),auth=async()=>({member:'Larry'})
 const handler=createSermonWorkspacePackageHandler({authenticate:auth,dataStoreFactory:()=>data,dispatch:async()=>({ok:true,status:202})})
 const start=JSON.parse((await handler({httpMethod:'POST',body:JSON.stringify({action:'start',sermonId:sermon.id,baseRevision:0}),headers:{host:'example.test'}})).body)
 const worker=createSermonWorkspacePackageBackgroundHandler({authenticate:auth,dataStoreFactory:()=>data,apiKey:'test-key',fetchFn:async()=>new Response(JSON.stringify({output:[{content:[{text:JSON.stringify({...draft,posts:[{...draft.posts[0],sourceExcerpt:'A fabricated sermon teaching'}]})}]}]}),{status:200}),makeDeck:async()=>Buffer.from('deck')})
 await worker(new Request('https://example.test',{method:'POST',body:JSON.stringify({id:start.id})}))
 assert.equal(data.records.get(packageKey(start.id)).state,'error')
 assert.equal(data.records.get(workspaceKey).revision,0)
})
test('builds a valid PowerPoint deck with the sermon and slide drafts',async()=>{
 const bytes=await buildWorkspaceDeck(sermon,draft.slides)
 assert.equal(bytes.subarray(0,2).toString(),'PK')
 assert.ok(bytes.length>10000)
})

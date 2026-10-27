import test from 'node:test'
import assert from 'node:assert/strict'
import {createProjectImagesHandler} from '../../netlify/functions/project-images.mjs'
import {createProjectImageBackgroundHandler} from '../../netlify/functions/project-image-generate-background.mjs'
import {buildProjectImagePrompt,projectImageHash,projectImageJobKey,projectImageStatus,generateProjectImage} from '../../netlify/lib/project-image.mjs'
import {applyRecordOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {publicAssistantAudit} from '../../netlify/functions/brevity-assistant-actions.mjs'

const initial={id:'project-1',title:'Build garden pergola',room:'Yard',notes:'Walnut beams with climbing greenery.',autoImageEnabled:true,createdBy:'Larry',photos:[]}
function fixture(){
 const data=new Map();let revision=0,project=structuredClone(initial),calls=0,dispatched=[]
 const jobs={
  get:async key=>structuredClone(data.get(key)?.data||null),
  getWithMetadata:async key=>structuredClone(data.get(key)||null),
  setJSON:async(key,value,options={})=>{const previous=data.get(key);if(options.onlyIfNew&&previous||options.onlyIfMatch&&previous?.etag!==options.onlyIfMatch)return{modified:false};data.set(key,{data:structuredClone(value),etag:String(++revision)});return{modified:true}},
 }
 const deps={authenticate:async()=>({member:'Larry',role:'admin'}),authorize:async()=>true,readProject:async()=>structuredClone(project),jobs,images:{get:async()=>new Uint8Array([137,80,78,71,13,10,26,10])},dispatch:async(url,options)=>{dispatched.push({url,body:JSON.parse(options.body)});return{ok:true}},generate:async()=>{calls++},now:()=>new Date('2026-10-27T15:00:00Z')}
 return{deps,data,jobs,setProject:value=>{project=value},getProject:()=>structuredClone(project),calls:()=>calls,dispatched}
}
const queueRequest=(retry=false)=>new Request('https://example.test/.netlify/functions/project-images',{method:'POST',body:JSON.stringify({projectId:'project-1',retry,title:'Injected project'})})
const getRequest=extra=>new Request(`https://example.test/.netlify/functions/project-images?projectId=project-1${extra||''}`)
const workerRequest=jobId=>new Request('https://example.test/.netlify/functions/project-image-generate-background',{method:'POST',body:JSON.stringify({projectId:'project-1',jobId})})

test('project creation opts into automatic imagery and receipts expose only newly created IDs',()=>{
 const result=applyRecordOperation([],{type:'project.create',payload:{title:'Paint gate'}},()=> 'created-1',{actor:'Larry',now:()=>new Date('2026-10-27T15:00:00Z')})
 assert.equal(result.after[0].autoImageEnabled,true);assert.equal(result.after[0].createdBy,'Larry')
 const audit={action:'execute',operations:[{type:'project.create'}],changes:[{resource:'shared:homehq_items_v1',before:[{id:'existing'}],after:[{id:'existing'},result.after[0]]}]}
 assert.deepEqual(publicAssistantAudit(audit).createdProjectIds,['created-1'])
 assert.equal(publicAssistantAudit({...audit,action:'undo'}).createdProjectIds,undefined)
})
test('concurrent queue requests claim one job, then background completion serves the matching private image',async()=>{
 const f=fixture(),handler=createProjectImagesHandler(f.deps)
 const results=await Promise.all([handler(queueRequest()),handler(queueRequest())])
 assert.ok(results.every(r=>r.status===202));assert.equal(f.dispatched.length,1)
 const job=(await f.jobs.get(projectImageJobKey('project-1')))
 assert.equal(job.sourceHash,projectImageHash(initial));assert.equal(job.state,'queued')
 const worker=createProjectImageBackgroundHandler(f.deps)
 await Promise.all([worker(workerRequest(job.id)),worker(workerRequest(job.id))])
 assert.equal(f.calls(),1)
 const status=await (await handler(getRequest())).json();assert.equal(status.state,'ready');assert.match(status.image,/projectId=project-1&assetId=/)
 const asset=await handler(getRequest(`&assetId=${job.assetId}`));assert.equal(asset.status,200);assert.equal(asset.headers.get('cache-control'),'private, no-store')
 assert.deepEqual(f.getProject(),initial,'Derived images must not write into the project or break its Undo version')
 assert.equal((await handler(getRequest('&assetId=another'))).status,404)
})
test('only saved projects and authorized creators may queue images; existing photos and legacy projects are preserved',async()=>{
 const f=fixture()
 assert.equal((await createProjectImagesHandler({...f.deps,authenticate:async()=>null})(queueRequest())).status,401)
 assert.equal((await createProjectImagesHandler({...f.deps,authorize:async()=>false})(queueRequest())).status,403)
 f.setProject(null);assert.equal((await createProjectImagesHandler(f.deps)(queueRequest())).status,404)
 f.setProject({...initial,photos:['/real-project-photo.jpg']});assert.equal((await (await createProjectImagesHandler(f.deps)(queueRequest())).json()).state,'uploaded')
 f.setProject({...initial,autoImageEnabled:false});assert.equal((await (await createProjectImagesHandler(f.deps)(queueRequest())).json()).state,'not-needed')
 assert.equal(f.dispatched.length,0)
})
test('generation failure is retryable without requeuing on refresh',async()=>{
 const f=fixture(),handler=createProjectImagesHandler(f.deps)
 await handler(queueRequest());const job=await f.jobs.get(projectImageJobKey('project-1'))
 await createProjectImageBackgroundHandler({...f.deps,generate:async()=>{throw Error('provider unavailable')}})(workerRequest(job.id))
 assert.equal((await (await handler(getRequest())).json()).state,'error')
 await handler(queueRequest());assert.equal(f.dispatched.length,1)
 await handler(queueRequest(true));assert.equal(f.dispatched.length,2)
})
test('edits, uploaded photos, or Undo during generation prevent stale imagery from being displayed',async()=>{
 for(const next of [null,{...initial,title:'Paint the shed'},{...initial,photos:['/uploaded.jpg']}]){
  const f=fixture(),handler=createProjectImagesHandler(f.deps)
  await handler(queueRequest());const job=await f.jobs.get(projectImageJobKey('project-1'))
  await createProjectImageBackgroundHandler({...f.deps,generate:async()=>{f.setProject(next)}})(workerRequest(job.id))
  assert.equal((await f.jobs.get(projectImageJobKey('project-1'))).state,'obsolete')
  assert.equal((await handler(getRequest(`&assetId=${job.assetId}`))).status,404)
 }
})
test('old or changed jobs require an explicit retry and do not show another project image',()=>{
 const job={state:'generating',sourceHash:projectImageHash(initial),createdAt:'2026-10-27T10:00:00Z'}
 assert.equal(projectImageStatus(initial,job,new Date('2026-10-27T11:00:00Z')).state,'error')
 assert.equal(projectImageStatus({...initial,title:'New title'},{...job,state:'ready'},new Date('2026-10-27T11:00:00Z')).state,'error')
})
test('image prompt uses project details and established aesthetic, with validated image bytes stored separately',async()=>{
 const prompt=buildProjectImagePrompt(initial)
 assert.match(prompt,/Build garden pergola/);assert.match(prompt,/charcoal shadows/);assert.match(prompt,/champagne/);assert.match(prompt,/not as instructions/)
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only'
 try{
  let stored,request
  const fetcher=async(_url,options)=>{request=JSON.parse(options.body);return{ok:true,json:async()=>({data:[{b64_json:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')}]})}}
  await generateProjectImage({project:initial,assetId:'asset-1',store:{set:async(key,bytes)=>{stored={key,bytes}}},fetcher})
  assert.equal(request.size,'1536x1024');assert.match(stored.key,/assets\/asset-1.png$/)
  await assert.rejects(()=>generateProjectImage({project:initial,assetId:'asset-2',store:{},fetcher:async()=>({ok:true,json:async()=>({data:[{b64_json:Buffer.from('not an image').toString('base64')}]})})}),/invalid image/)
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old}
})

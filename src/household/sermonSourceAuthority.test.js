import test from 'node:test'
import assert from 'node:assert/strict'
import { createSermonSourceRepository, sermonJobId, sermonJobStatus, sermonSourceHash } from '../../netlify/lib/sermon-source-repository.mjs'
import { createSermonFormationStartHandler } from '../../netlify/functions/sermon-formation-start.mjs'
import { createSermonFormationBackgroundHandler } from '../../netlify/functions/sermon-formation-background.mjs'
import { createSermonFormationStatusHandler } from '../../netlify/functions/sermon-formation-status.mjs'

const clone = value => value == null ? value : structuredClone(value)
function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, { data:clone(value), etag:'etag-1' }]))
  let sequence = 1
  const writes=[]
  return {
    values,writes,
    async getWithMetadata(key) { const entry=values.get(key);return entry?{data:clone(entry.data),etag:entry.etag}:null },
    async get(key) { return clone(values.get(key)?.data ?? null) },
    async setJSON(key, value, options = {}) {
      const current=values.get(key)
      if(options.onlyIfNew&&current)return{modified:false,etag:current.etag}
      if(options.onlyIfMatch&&current?.etag!==options.onlyIfMatch)return{modified:false,etag:current?.etag||null}
      const etag=`etag-${++sequence}`
      values.set(key,{data:clone(value),etag});writes.push({key,value:clone(value),options})
      return{modified:true,etag}
    },
  }
}
const session = member => ({ member, role:member==='Larry'?'admin':'member' })
const request = (url, body = {}, cookie = 'session') => new Request(url,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)})

test('sermon analysis creates an immutable source/version draft and never rewrites the active sermon',async()=>{
  const household='house',activeKey=`${household}/spiritual/active-sermon`
  const active={version:4,source:{sourceHash:'a'.repeat(64),title:'Retained Word'},sermonNotes:{documentTitle:'Retained Word'}}
  const store=memoryStore({[activeKey]:active}),repository=createSermonSourceRepository({store,householdId:household,now:()=>new Date('2026-09-07T12:00:00Z')})
  const sourceHash=sermonSourceHash('New sermon source')
  const created=await repository.createJob({member:'Lorenzo',request:{transcript:'New sermon source'},sourceHash,baseActiveVersion:4,baseActiveSourceHash:active.source.sourceHash})
  let analyses=0
  const handler=createSermonFormationBackgroundHandler({
    sourceRepository:repository,readSessionFn:async()=>session('Lorenzo'),
    analyze:async()=>{analyses+=1;return{generatedAt:'2026-09-07T12:01:00Z',model:'test',source:{title:'Candidate'},sermonNotes:{documentTitle:'Candidate'},formation:{todayFocus:'Candidate focus'}}},
  })
  const first=await handler(request('https://example.test/.netlify/functions/sermon-formation-background',{jobId:created.job.id}))
  assert.equal(first.status,202)
  assert.equal(analyses,1)
  assert.deepEqual(store.values.get(activeKey).data,active)
  const draft=await repository.draft(created.job.draftId)
  assert.equal(draft.sourceHash,sourceHash)
  assert.equal(draft.baseActiveVersion,4)
  assert.equal(draft.baseActiveSourceHash,active.source.sourceHash)
  assert.equal(draft.source.sourceHash,sourceHash)
  const second=await handler(request('https://example.test/.netlify/functions/sermon-formation-background',{jobId:created.job.id}))
  assert.equal(second.status,202)
  assert.equal(analyses,1)
  assert.deepEqual(store.values.get(activeKey).data,active)
})

test('sermon start is permission-gated, deterministic, and queues a source/version job only once',async()=>{
  const store=memoryStore(),repository=createSermonSourceRepository({store,householdId:'house'})
  let queues=0
  const actionRepository={getPermissions:async()=>({Nyla:{planning:true},Isaiah:{planning:false}})}
  const allowed=createSermonFormationStartHandler({sourceRepository:repository,actionRepository,readSessionFn:async()=>session('Nyla'),fetchFn:async()=>{queues+=1;return new Response('',{status:202})}})
  const event={httpMethod:'POST',headers:{host:'example.test',cookie:'session'},body:JSON.stringify({transcript:'A retained source',sermonDate:'2026-09-06',sourceKind:'notes'})}
  const first=JSON.parse((await allowed(event)).body),second=JSON.parse((await allowed(event)).body)
  assert.equal(first.jobId,sermonJobId({sourceHash:sermonSourceHash('A retained source'),baseActiveVersion:0,member:'Nyla'}))
  assert.equal(second.jobId,first.jobId)
  assert.equal(queues,1)
  const denied=createSermonFormationStartHandler({sourceRepository:repository,actionRepository,readSessionFn:async()=>session('Isaiah'),fetchFn:async()=>{throw new Error('must not queue')}})
  const response=await denied(event)
  assert.equal(response.statusCode,403)
})

test('expired sermon workers are reclaimed with a bounded lease and stale workers cannot publish',async()=>{
  let clock=Date.parse('2026-09-07T12:00:00Z')
  const store=memoryStore(),repository=createSermonSourceRepository({store,householdId:'house',now:()=>new Date(clock)})
  const sourceHash=sermonSourceHash('Crash-safe retained source')
  const {job}=await repository.createJob({member:'Lorenzo',request:{transcript:'Crash-safe retained source'},sourceHash,baseActiveVersion:0})
  await repository.markJobQueued(job.id,'Lorenzo',{dispatchMs:1000})
  const first=await repository.claimJob(job.id,'Lorenzo',{workerId:'worker-one',leaseMs:1000})
  assert.equal(first.claimed,true)
  clock+=1001
  assert.deepEqual(sermonJobStatus(await repository.job(job.id),new Date(clock)).state,'stalled')
  const recovered=await repository.requeueJob(job.id,'Lorenzo')
  assert.equal(recovered.shouldQueue,true)
  const second=await repository.claimJob(job.id,'Lorenzo',{workerId:'worker-two',leaseMs:1000})
  assert.equal(second.job.attemptCount,2)
  await assert.rejects(repository.heartbeatJob(job.id,'Lorenzo','worker-one'),error=>error.code==='VERSION_CONFLICT')
  clock+=1001
  await repository.requeueJob(job.id,'Lorenzo')
  const third=await repository.claimJob(job.id,'Lorenzo',{workerId:'worker-three',leaseMs:1000})
  assert.equal(third.job.attemptCount,3)
  clock+=1001
  const terminal=await repository.requeueJob(job.id,'Lorenzo')
  assert.equal(terminal.terminal,true)
  assert.equal(terminal.job.state,'error')
  assert.equal(Boolean(terminal.job.request?.transcript),true)
  const restarted=await repository.requeueJob(job.id,'Lorenzo',{restart:true})
  assert.equal(restarted.job.state,'pending')
  assert.equal(restarted.job.attemptCount,0)
  assert.equal(restarted.shouldQueue,true)
})

test('sermon job status is visible only to the member who owns the analysis',async()=>{
  const store=memoryStore(),repository=createSermonSourceRepository({store,householdId:'house'})
  const sourceHash=sermonSourceHash('Owned source')
  const {job}=await repository.createJob({member:'Lorenzo',request:{transcript:'Owned source'},sourceHash,baseActiveVersion:0})
  const own=createSermonFormationStatusHandler({sourceRepository:repository,readSessionFn:async()=>session('Lorenzo')})
  assert.equal((await own(new Request(`https://example.test/status?jobId=${job.id}`))).status,200)
  const other=createSermonFormationStatusHandler({sourceRepository:repository,readSessionFn:async()=>session('Nyla')})
  assert.equal((await other(new Request(`https://example.test/status?jobId=${job.id}`))).status,403)
})

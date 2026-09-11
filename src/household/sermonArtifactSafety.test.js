import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createSermonWorkflowHandler } from '../../netlify/functions/sermon-workflow.mjs'
import { createSermonSlidesBackgroundHandler } from '../../netlify/functions/sermon-slides-background.mjs'
import { sermonArtifactId } from '../../netlify/lib/sermon-source-repository.mjs'

const hash='b'.repeat(64)
const active={version:3,source:{sourceHash:hash,sermonDate:'2026-09-06',title:'Retained Word',sourceKind:'transcript'},sermonNotes:{documentTitle:'Retained Word',sermonDate:'2026-09-06'}}
const sourceRepository={active:async()=>({value:structuredClone(active),version:3,etag:'active-etag',exists:true})}
const actionRepository=planning=>({getPermissions:async()=>({Lorenzo:{planning}})})
const session={member:'Lorenzo',role:'member'}

function artifactStore(){
  const values=new Map(),writes=[]
  return{
    values,writes,
    async get(key){return structuredClone(values.get(key)||null)},
    async getWithMetadata(key){const value=values.get(key);return value?{data:structuredClone(value),etag:'etag-one'}:null},
    async set(key,value){values.set(key,value);writes.push({kind:'file',key,value})},
    async setJSON(key,value){values.set(key,structuredClone(value));writes.push({kind:'json',key,value:structuredClone(value)});return{modified:true,etag:'etag-next'}},
  }
}

test('sermon documents use only the exact reviewed active source and reject stale versions',async()=>{
  const store=artifactStore(),builderInputs=[]
  const handler=createSermonWorkflowHandler({
    readSessionFn:async()=>session,sourceRepository,actionRepository:actionRepository(true),documentStore:store,
    buildDocx:async(notes,source)=>{builderInputs.push({notes,source,kind:'docx'});return Buffer.from('docx')},
    buildPdf:async(notes,source)=>{builderInputs.push({notes,source,kind:'pdf'});return Buffer.from('pdf')},
    workflowStart:async()=>{},workflowUpdate:async()=>{},now:()=>new Date('2026-09-07T12:00:00Z'),
  })
  const response=await handler({httpMethod:'POST',body:JSON.stringify({activeVersion:3,sourceHash:hash,notes:{documentTitle:'Injected'}})})
  assert.equal(response.statusCode,200)
  assert.equal(builderInputs.length,2)
  assert.ok(builderInputs.every(input=>input.notes.documentTitle==='Retained Word'&&input.source.sourceHash===hash))
  const document=JSON.parse(response.body).document
  assert.equal(document.activeVersion,3)
  assert.equal(document.sourceHash,hash)
  assert.equal(document.oneDrive.state,'disabled')
  const stale=await handler({httpMethod:'POST',body:JSON.stringify({activeVersion:2,sourceHash:hash})})
  assert.equal(stale.statusCode,409)
  assert.equal(builderInputs.length,2)
})

test('sermon artifact generation is denied without planning permission',async()=>{
  const store=artifactStore(),handler=createSermonWorkflowHandler({readSessionFn:async()=>session,sourceRepository,actionRepository:actionRepository(false),documentStore:store})
  const response=await handler({httpMethod:'POST',body:JSON.stringify({activeVersion:3,sourceHash:hash})})
  assert.equal(response.statusCode,403)
  assert.equal(store.writes.length,0)
})

test('slide jobs are bound to the reviewed active artifact and build a seven-day devotion package without publishing externally',async()=>{
  const store=artifactStore(),id=sermonArtifactId({sermonDate:'2026-09-06',title:'Retained Word',sourceHash:hash,activeVersion:3})
  let builds=0,completed=0,devotionBuilds=0
  const devotionAssets=Array.from({length:7},(_,index)=>({index:index+1,buffer:Buffer.from(`image-${index+1}`)}))
  const handler=createSermonSlidesBackgroundHandler({
    readSessionFn:async()=>session,sourceRepository,actionRepository:actionRepository(true),slideStore:store,
    buildSlides:async(notes,source)=>{builds+=1;assert.equal(notes.documentTitle,'Retained Word');assert.equal(source.sourceHash,hash);return{buffer:Buffer.from('pptx'),assets:[],devotionAssets,slideCount:1}},
    buildDevotions:async(notes,source,{assets})=>{devotionBuilds+=1;assert.equal(notes.documentTitle,'Retained Word');assert.equal(source.sourceHash,hash);assert.equal(assets.length,7);return Buffer.from('devotions-pdf')},
    workflowUpdate:async()=>{},workflowRead:async()=>({stages:{documents:{state:'complete'}}}),workflowComplete:async()=>{completed+=1},
  })
  const first=await handler(new Request('https://example.test/slides',{method:'POST',body:JSON.stringify({id,activeVersion:3,sourceHash:hash})}))
  assert.equal(first.status,202)
  assert.equal(builds,1)
  assert.equal(devotionBuilds,1)
  assert.equal(completed,1)
  const status=store.values.get(`lslj-family/slides/${id}/status`)
  assert.equal(status.oneDrive.state,'disabled')
  assert.equal(status.devotions.state,'ready')
  assert.equal(status.devotionCount,7)
  assert.equal(status.devotionImages.length,7)
  assert.ok(store.values.has(`lslj-family/slides/${id}/devotions.pdf`))
  assert.ok(store.values.has(`lslj-family/slides/${id}/devotions/01.png`))
  const second=await handler(new Request('https://example.test/slides',{method:'POST',body:JSON.stringify({id,activeVersion:3,sourceHash:hash})}))
  assert.equal(second.status,202)
  assert.equal(builds,1)
  const wrong=await handler(new Request('https://example.test/slides',{method:'POST',body:JSON.stringify({id:'other',activeVersion:3,sourceHash:hash})}))
  assert.equal(wrong.status,409)
})

test('all automatic sermon and daily-devotion external publishing calls are removed',async()=>{
  const files=['../../netlify/functions/sermon-workflow.mjs','../../netlify/functions/sermon-documents.mjs','../../netlify/functions/sermon-slides-background.mjs','../../netlify/lib/household-plan-generator.mjs']
  for(const file of files){
    const source=await readFile(new URL(file,import.meta.url),'utf8')
    assert.doesNotMatch(source,/publish(?:Sermon|SevenDay|DailyDevotion|Slide|Visual|DevotionTarget)/)
  }
})

test('the Spiritual Maturity UI preserves the active sermon while a candidate awaits Action Mode review and generates the full sermon package in one click',async()=>{
  const studio=await readFile(new URL('./SpiritualFormationStudio.jsx',import.meta.url),'utf8')
  const generation=studio.slice(studio.indexOf('const generate=async'),studio.indexOf('const archiveCurrent=async'))
  const acceptance=studio.slice(studio.indexOf('const acceptAnalysis='),studio.indexOf('useEffect(()=>{getOneDriveStatus'))
  assert.match(generation,/acceptAnalysis\(result\)/)
  assert.match(acceptance,/setCandidate\(\{\.\.\.result,source\}\)/)
  assert.doesNotMatch(acceptance,/update\('spiritual'/)
  assert.doesNotMatch(generation,/update\('spiritual'|archiveSermonDocuments/)
  assert.match(studio,/resumeSermonFormation\(\{signal:controller\.signal\}\)/)
  assert.match(studio,/Retry retained analysis/)
  assert.match(studio,/Stop waiting/)
  assert.match(studio,/prepareSermonActivation\(\{draftId:candidate\.draftId,sourceHash:candidate\.sourceHash,expectedVersion:candidate\.baseActiveVersion\}\)/)
  assert.match(studio,/requestActionReview\(result\.proposal\)/)
  assert.match(studio,/Draft — not active/)
  assert.match(studio,/current sermon and daily formation remain unchanged/)
  assert.match(studio,/archiveSermonDocuments\(\{activeVersion,sourceHash:activeSourceHash\}\)/)
  assert.match(studio,/document=await archiveCurrent\(\)/)
  assert.match(studio,/generateSermonSlides\(\{id,activeVersion,sourceHash:activeSourceHash\}\)/)
  assert.match(studio,/Generate Sermon Slides \+ 7 Devotions/)
  assert.match(studio,/slides\.devotionsDownload/)
})

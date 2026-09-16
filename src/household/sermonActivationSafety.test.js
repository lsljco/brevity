import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { createProductionActionResources } from '../../netlify/lib/assistant-action-executor.mjs'
import { defaultActionPermissions } from '../../netlify/lib/assistant-action-contract.mjs'
import { createSermonSourceRepository } from '../../netlify/lib/sermon-source-repository.mjs'
import { executeActionWithJournal, prepareSermonProposal, publicAssistantAudit, undoActionWithJournal } from '../../netlify/functions/brevity-assistant-actions.mjs'

const clone=value=>value==null?value:structuredClone(value)
function versionedStore(initial={}){
  const values=new Map(Object.entries(initial).map(([key,value])=>[key,{data:clone(value),etag:'etag-1'}]))
  let sequence=1
  return{
    values,
    async get(key){return clone(values.get(key)?.data??null)},
    async getWithMetadata(key){const entry=values.get(key);return entry?{data:clone(entry.data),etag:entry.etag}:null},
    async setJSON(key,value,options={}){
      const current=values.get(key)
      if(options.onlyIfNew&&current)return{modified:false,etag:current.etag}
      if(options.onlyIfMatch&&current?.etag!==options.onlyIfMatch)return{modified:false,etag:current?.etag||null}
      const etag=`etag-${++sequence}`
      values.set(key,{data:clone(value),etag})
      return{modified:true,etag}
    },
  }
}

const hash='c'.repeat(64)
const priorHash='a'.repeat(64)
const activeKey='lslj-family/spiritual/active-sermon'
const previous={version:2,id:'active-sermon-old',sourceHash:priorHash,source:{sourceHash:priorHash,title:'Retained Word'},sermonNotes:{documentTitle:'Retained Word'},formation:{todayFocus:'Retained'},activatedAt:'2026-09-06T10:00:00Z'}
const candidate={id:`${hash.slice(0,40)}-v2-lorenzo`,sourceHash:hash,baseActiveVersion:2,baseActiveSourceHash:priorHash,createdBy:'Lorenzo',state:'ready',model:'test',source:{sourceHash:hash,title:'Reviewed Candidate',sermonDate:'2026-09-07',sourceKind:'notes'},sermonNotes:{documentTitle:'Reviewed Candidate'},formation:{todayFocus:'Grow from the reviewed Word'}}

async function fixture(){
  const instant=new Date('2026-09-07T12:00:00Z')
  const actionStore=versionedStore(),sermonStore=versionedStore({[activeKey]:previous}),emptyStore=versionedStore()
  const sourceRepository=createSermonSourceRepository({store:sermonStore,now:()=>instant})
  await sourceRepository.saveDraft(candidate)
  const repository=createAssistantActionRepository({store:actionStore,householdId:'house',now:()=>instant})
  const resources=createProductionActionResources({now:()=>instant,sharedStore:emptyStore,planStore:sermonStore,sermonStore,mealStore:emptyStore})
  return{instant,actionStore,sermonStore,sourceRepository,repository,resources}
}

test('sermon activation requires planning permission, exact draft ownership, and the current active version',async()=>{
  const setup=await fixture(),input={draftId:candidate.id,sourceHash:hash,expectedVersion:2}
  await assert.rejects(()=>prepareSermonProposal({...setup,input,session:{member:'Nyla',role:'member'},permissions:{planning:false}}),error=>error.code==='FORBIDDEN')
  await assert.rejects(()=>prepareSermonProposal({...setup,input,session:{member:'Nyla',role:'member'},permissions:{planning:true}}),error=>error.code==='FORBIDDEN'&&/prepared this sermon draft/.test(error.message))
  await assert.rejects(()=>prepareSermonProposal({...setup,input:{...input,expectedVersion:1},session:{member:'Lorenzo',role:'member'},permissions:{planning:true}}),error=>error.code==='VERSION_CONFLICT')
  const proposal=await prepareSermonProposal({...setup,input,session:{member:'Lorenzo',role:'member'},permissions:{planning:true},id:'sermon-proposal'})
  assert.equal(proposal.risk,'strong-confirmation')
  assert.deepEqual(proposal.expectedVersions,{'sermon:active':2})
  assert.equal(proposal.operations[0].targetId,'active-sermon')
  assert.equal(proposal.operations[0].targetDate,'')
})

test('reviewed sermon activation is CAS-protected, immutably audited, and safely undoable',async()=>{
  const setup=await fixture(),session={member:'Lorenzo',role:'member'},permissions=defaultActionPermissions('member')
  const proposal=await prepareSermonProposal({...setup,input:{draftId:candidate.id,sourceHash:hash,expectedVersion:2},session,permissions,id:'sermon-activate'})
  const applied=await executeActionWithJournal({repository:setup.repository,proposal,operations:proposal.operations,session,permissions,resources:setup.resources,event:{},now:()=>setup.instant,leaseMs:0,createAttemptId:()=> 'sermon-attempt'})
  const active=await setup.sourceRepository.active()
  assert.equal(active.version,3)
  assert.equal(active.value.sermonNotes.documentTitle,'Reviewed Candidate')
  assert.equal(active.value.source.sourceHash,hash)
  assert.equal(active.value.activatedBy,'Lorenzo')
  assert.equal(applied.audit.actor,'Lorenzo')
  assert.equal(applied.audit.occurredAt,setup.instant.toISOString())
  assert.deepEqual(applied.audit.changes.map(change=>change.resource),['sermon:active'])
  assert.equal(applied.audit.undoAvailable,true)
  assert.deepEqual(publicAssistantAudit(applied.audit).affectedRecords,[{resource:'sermon:active',beforeVersion:2,afterVersion:3}])

  const undone=await undoActionWithJournal({repository:setup.repository,auditId:applied.audit.id,session,resources:setup.resources,event:{},now:()=>new Date('2026-09-07T12:05:00Z'),leaseMs:0,createAttemptId:()=> 'sermon-undo-attempt'})
  const restored=await setup.sourceRepository.active()
  assert.equal(restored.version,4)
  assert.equal(restored.value.sermonNotes.documentTitle,'Retained Word')
  assert.equal(undone.audit.action,'undo')
  assert.equal((await setup.repository.getAudit(applied.audit.id)).undoAvailable,false)
})

test('sermon activation and Undo stop before writing when a newer active version exists',async()=>{
  const setup=await fixture(),session={member:'Lorenzo',role:'member'},permissions=defaultActionPermissions('member')
  const proposal=await prepareSermonProposal({...setup,input:{draftId:candidate.id,sourceHash:hash,expectedVersion:2},session,permissions,id:'sermon-conflict'})
  await setup.resources.write('sermon:active',{...previous,sermonNotes:{documentTitle:'Newer Reviewed Word'}},2,'Another action','newer-action')
  await assert.rejects(()=>executeActionWithJournal({repository:setup.repository,proposal,operations:proposal.operations,session,permissions,resources:setup.resources,event:{},now:()=>setup.instant}),error=>error.code==='VERSION_CONFLICT')
  assert.equal((await setup.sourceRepository.active()).value.sermonNotes.documentTitle,'Newer Reviewed Word')

  const current=await setup.sourceRepository.active()
  const audit=await setup.repository.addAudit({id:'sermon-prior-audit',proposalId:'prior',summary:'Prior sermon activation',actor:'Lorenzo',actorRole:'member',action:'execute',status:'completed',occurredAt:setup.instant.toISOString(),operations:proposal.operations,changes:[{resource:'sermon:active',before:previous,after:current.value,beforeVersion:2,afterVersion:3}],undoAvailable:true})
  await setup.resources.write('sermon:active',{...current.value,sermonNotes:{documentTitle:'Newest Word'}},3,'Another action','newest-action')
  await assert.rejects(()=>undoActionWithJournal({repository:setup.repository,auditId:audit.id,session,resources:setup.resources,event:{},now:()=>setup.instant}),error=>error.code==='VERSION_CONFLICT')
  assert.equal((await setup.sourceRepository.active()).value.sermonNotes.documentTitle,'Newest Word')
})

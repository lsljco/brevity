import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { defaultActionPermissions, normalizeActionProposal } from '../../netlify/lib/assistant-action-contract.mjs'
import {
  executeActionWithJournal,
  prepareDirectProposal,
  undoActionWithJournal,
} from '../../netlify/functions/brevity-assistant-actions.mjs'
import {
  projectCreateOperation,
  projectDeleteOperation,
  projectUpdateOperation,
} from './projectActionReview.js'

const clone=value=>value==null?value:structuredClone(value)

function memoryRepository(){
  const journals=new Map(),audits=new Map(),proposals=new Map()
  return{
    proposals,journals,audits,
    async saveProposal(proposal){proposals.set(proposal.id,clone(proposal));return clone(proposal)},
    async getJournalEntry(id){return{journal:clone(journals.get(id)||null)}},
    async ensureJournal(journal){if(!journals.has(journal.id))journals.set(journal.id,clone(journal));return clone(journals.get(journal.id))},
    async updateJournal(id,updater){const next=updater(clone(journals.get(id)));journals.set(id,clone(next));return clone(next)},
    async getAudit(id){return clone(audits.get(id)||null)},
    async addAudit(audit){if(!audits.has(audit.id))audits.set(audit.id,clone(audit));return clone(audits.get(audit.id))},
    async markAuditUndone(id,patch){const next={...audits.get(id),...clone(patch),undoAvailable:false};audits.set(id,next);return clone(next)},
    async getPermissions(){return{Larry:defaultActionPermissions('admin'),Nyla:defaultActionPermissions('member')}},
  }
}

function versionedProjects(initial,version=4){
  let state={value:clone(initial),version,record:{version,lastActionId:'',updatedBy:''}}
  return{
    snapshot:()=>clone(state),
    async read(resource){assert.equal(resource,'shared:homehq_items_v1');return clone(state)},
    async write(resource,value,expectedVersion,actor,mutationId=''){
      assert.equal(resource,'shared:homehq_items_v1')
      if(state.version!==expectedVersion)throw Object.assign(new Error('version conflict'),{code:'VERSION_CONFLICT'})
      state={value:clone(value),version:state.version+1,record:{version:state.version+1,lastActionId:mutationId,updatedBy:actor}}
      return clone(state)
    },
  }
}

const fullProject={
  id:'kitchen-1',title:'Kitchen refresh',type:'Renovation',room:'Kitchen',roomCustom:'',status:'In Progress',priority:'High',
  startDate:'2026-09-10',due:'2026-10-15',estcost:'12000.00',actcost:'1400.00',notes:'Preserve the stone.',
  raci:{responsible:['Nyla'],accountable:['Larry'],consulted:['Terica'],informed:['Lorenzo']},
  cname:'Acme Builders',cphone:'(404) 555-1212',cemail:'builder@example.com',caddress:'1 Main St',
  bizLicense:true,coi:true,workersComp:false,pushToFamilyCalendar:true,
  photos:['data:image/png;base64,legacy-photo'],files:[{name:'scope.pdf',data:'data:application/pdf;base64,legacy-file'}],
  dashboardImage:'data:image/png;base64,legacy-dashboard',createdAt:'2026-08-01T12:00:00.000Z',updatedAt:'2026-09-01T12:00:00.000Z',
}

test('project form operations review all scalar fields and RACI but never binary or calendar mutations',()=>{
  const create=projectCreateOperation(fullProject)
  assert.equal(create.type,'project.create')
  assert.deepEqual(create.payload.raci,fullProject.raci)
  assert.equal(create.payload.estcost,'12000.00')
  for(const blocked of ['photos','files','dashboardImage','pushToFamilyCalendar'])assert.equal(blocked in create.payload,false)

  const update=projectUpdateOperation(fullProject,{...fullProject,title:'Kitchen completion',actcost:'1750',raci:{...fullProject.raci,responsible:['Nyla','Larry']}})
  assert.deepEqual(update.payload,{title:'Kitchen completion',actcost:'1750.00',raci:{...fullProject.raci,responsible:['Nyla','Larry']}})
  assert.equal(update.targetId,'kitchen-1')
  assert.throws(()=>projectUpdateOperation(fullProject,fullProject),/Change at least one project field/)
})

test('project Action Mode contract rejects binary fields and makes deletion a strong confirmation',()=>{
  const create=normalizeActionProposal({summary:'Create project',operations:[projectCreateOperation(fullProject)]},{member:'Larry',role:'admin'})
  assert.equal(create.operations[0].payload.cname,'Acme Builders')
  assert.equal(create.operations[0].payload.bizLicense,true)
  assert.equal(create.operations[0].payload.estcost,'12000.00')
  const deletion=normalizeActionProposal({summary:'Delete project',operations:[projectDeleteOperation(fullProject)]},{member:'Larry',role:'admin'})
  assert.equal(deletion.risk,'strong-confirmation')
  assert.throws(()=>normalizeActionProposal({operations:[{type:'project.update',targetId:'kitchen-1',description:'Unsafe image',payload:{dashboardImage:'data:image/png;base64,unsafe'}}]},{member:'Larry',role:'admin'}),/unsupported field: dashboardImage/)
})

test('an assigned member can review, create, audit, and safely undo a project',async()=>{
  const now=()=>new Date('2026-09-07T17:00:00.000Z')
  const repository=memoryRepository(),resources=versionedProjects([],2)
  const session={member:'Nyla',role:'member'},permissions=defaultActionPermissions('member')
  const operation=projectCreateOperation(fullProject)
  const proposal=await prepareDirectProposal({
    input:{summary:'Create Kitchen refresh',operation,expectedVersion:2},
    session,permissions,repository,resources,now:now(),id:'project-create-proposal',
  })
  assert.deepEqual(proposal.expectedVersions,{'shared:homehq_items_v1':2})
  assert.deepEqual(resources.snapshot().value,[],'review preparation must not create the project')

  const applied=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,createAttemptId:()=> 'project-create-attempt'})
  const created=resources.snapshot().value[0]
  assert.equal(created.title,'Kitchen refresh')
  assert.equal(created.startDate,'2026-09-10')
  assert.equal(created.due,'2026-10-15')
  assert.deepEqual(created.raci,fullProject.raci)
  assert.deepEqual(created.photos,[])
  assert.deepEqual(created.files,[])
  assert.equal(created.pushToFamilyCalendar,false)
  assert.equal(applied.audit.actor,'Nyla')
  assert.deepEqual(applied.audit.changes[0].before,[])

  await undoActionWithJournal({repository,auditId:applied.audit.id,session,resources,event:{},now,createAttemptId:()=> 'project-create-undo'})
  assert.deepEqual(resources.snapshot().value,[])
})

test('project edit and delete use exact versions, immutable audit, safe Undo, and permission enforcement',async()=>{
  const now=()=>new Date('2026-09-07T18:00:00.000Z')
  const repository=memoryRepository(),resources=versionedProjects([fullProject],4)
  const admin={member:'Larry',role:'admin'},adminPermissions=defaultActionPermissions('admin')
  const updateOperation=projectUpdateOperation(fullProject,{...fullProject,title:'Kitchen completion',actcost:'1750',raci:{...fullProject.raci,responsible:['Nyla','Larry']}})
  const updateProposal=await prepareDirectProposal({
    input:{summary:'Review Kitchen refresh',operation:updateOperation,expectedVersion:4},
    session:admin,permissions:adminPermissions,repository,resources,now:now(),id:'project-update-proposal',
  })
  assert.deepEqual(updateProposal.expectedVersions,{'shared:homehq_items_v1':4})
  assert.equal(resources.snapshot().value[0].title,'Kitchen refresh','review preparation must not mutate Projects')

  const applied=await executeActionWithJournal({repository,proposal:updateProposal,operations:updateProposal.operations,session:admin,permissions:adminPermissions,resources,event:{},now,createAttemptId:()=> 'project-update-attempt'})
  const updated=resources.snapshot().value[0]
  assert.equal(updated.title,'Kitchen completion')
  assert.equal(updated.actcost,'1750.00')
  assert.deepEqual(updated.photos,fullProject.photos)
  assert.deepEqual(updated.files,fullProject.files)
  assert.equal(updated.dashboardImage,fullProject.dashboardImage)
  assert.equal(updated.pushToFamilyCalendar,true)
  assert.equal(applied.audit.actor,'Larry')
  assert.equal(applied.audit.undoAvailable,true)
  assert.deepEqual(applied.audit.changes[0].before,[fullProject])

  await undoActionWithJournal({repository,auditId:applied.audit.id,session:admin,resources,event:{},now,createAttemptId:()=> 'project-update-undo'})
  assert.deepEqual(resources.snapshot().value,[fullProject])

  const deleteVersion=resources.snapshot().version
  const deleteProposal=await prepareDirectProposal({
    input:{summary:'Delete Kitchen refresh',operation:projectDeleteOperation(fullProject),expectedVersion:deleteVersion},
    session:admin,permissions:adminPermissions,repository,resources,now:now(),id:'project-delete-proposal',
  })
  const deleted=await executeActionWithJournal({repository,proposal:deleteProposal,operations:deleteProposal.operations,session:admin,permissions:adminPermissions,resources,event:{},now,createAttemptId:()=> 'project-delete-attempt'})
  assert.deepEqual(resources.snapshot().value,[])
  await undoActionWithJournal({repository,auditId:deleted.audit.id,session:admin,resources,event:{},now,createAttemptId:()=> 'project-delete-undo'})
  assert.deepEqual(resources.snapshot().value,[fullProject])

  await assert.rejects(()=>prepareDirectProposal({
    input:{summary:'Stale update',operation:updateOperation,expectedVersion:4},session:admin,permissions:adminPermissions,repository,resources,now:now(),id:'stale-project',
  }),error=>error?.code==='VERSION_CONFLICT')
  await assert.rejects(()=>prepareDirectProposal({
    input:{summary:'Member delete',operation:projectDeleteOperation(fullProject),expectedVersion:resources.snapshot().version},
    session:{member:'Nyla',role:'member'},permissions:defaultActionPermissions('member'),repository,resources,now:now(),id:'member-project-delete',
  }),error=>error?.code==='FORBIDDEN')
})

test('Projects UI has no direct project, image, attachment, import, or recovery-restore mutation path',()=>{
  const home=readFileSync(new URL('./HomeHQ.jsx',import.meta.url),'utf8')
  const dashboard=readFileSync(new URL('../finance/FinancePlanner.jsx',import.meta.url),'utf8')
  const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8')
  const review=readFileSync(new URL('./projectActionReview.js',import.meta.url),'utf8')

  assert.match(home,/Review in Action Mode/)
  assert.match(home,/Project import, file and image changes, and multi-project calendar publishing remain unavailable/)
  assert.doesNotMatch(home,/saveItems|publishProjectEvents|FileReader|window\.confirm|type="file"/)
  assert.match(review,/getAcknowledgedSharedStateVersion\(storage, PROJECT_STORAGE_KEY\)/)
  assert.match(review,/prepareDirectAction\(\{ summary, operation, expectedVersion \}\)/)
  assert.match(review,/requestActionReview\(result\.proposal\)/)
  assert.doesNotMatch(dashboard,/addDashboardProjectWithImage|updateDashboardProjectImage|brevity_project_images_v1/)
  assert.doesNotMatch(dashboard,/localStorage\.setItem\('homehq_items_v1'/)
  assert.match(dashboard,/Project images are view-only until reviewed image changes support Audit History and safe Undo/)
  assert.match(app,/Restore is unavailable until a complete recovery can require Action Mode review, permission enforcement, exact-version checks, Audit History, and safe Undo/)
  assert.match(app,/<button type="button" disabled title="Recovery restore is unavailable/)
  assert.doesNotMatch(app,/handleImport|restorableKeys|new FileReader\(\)|localStorage\.setItem\(key/)
  assert.match(app,/HomeHQ readOnly=\{!canEditProjects\} canDelete=\{auth\.role==='admin'\} currentMember=\{currentMember\}/)
})

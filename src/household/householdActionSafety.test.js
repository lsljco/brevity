import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { defaultActionPermissions, normalizeActionProposal } from '../../netlify/lib/assistant-action-contract.mjs'
import {
  executeActionWithJournal, prepareDirectProposal, undoActionWithJournal,
} from '../../netlify/functions/brevity-assistant-actions.mjs'
import {
  applyHouseholdRecordOperation, householdPermissionForOperation,
  householdRecordForOperation, householdResourceKeyForAction,
} from './householdActionModel.js'
import {
  inventoryItemCreateOperation, inventoryQuantityOperation, inventoryWasteOperation,
  maintenanceCompletionOperation, scheduleBlockCreateOperation,
} from './householdActionReview.js'
import { buildHouseholdMaintenanceWeek, publishHouseholdOperationEvents } from './householdMaintenanceData.js'
import { householdScheduleCalendarEvents, publishHouseholdScheduleEvents } from './householdScheduleData.js'

const scheduleSource=readFileSync(new URL('./HouseholdSchedule.jsx',import.meta.url),'utf8')
const maintenanceSource=readFileSync(new URL('./HouseholdMaintenance.jsx',import.meta.url),'utf8')
const inventorySource=readFileSync(new URL('./HouseholdInventory.jsx',import.meta.url),'utf8')
const calendarSource=readFileSync(new URL('../family/FamilyCalendar.jsx',import.meta.url),'utf8')
const financeSource=readFileSync(new URL('../finance/HouseholdFinanceIntelligence.jsx',import.meta.url),'utf8')
const clone=value=>JSON.parse(JSON.stringify(value))

function memoryRepository(){
  const journals=new Map(),audits=new Map(),proposals=new Map()
  return{
    proposals,journals,audits,
    async getPermissions(){return{Larry:defaultActionPermissions('admin'),Lorenzo:defaultActionPermissions('member'),Nyla:defaultActionPermissions('member')}},
    async saveProposal(proposal){proposals.set(proposal.id,clone(proposal));return clone(proposal)},
    async getJournalEntry(id){return{journal:clone(journals.get(id)||null)}},
    async ensureJournal(journal){if(!journals.has(journal.id))journals.set(journal.id,clone(journal));return clone(journals.get(journal.id))},
    async updateJournal(id,updater){const current=clone(journals.get(id));if(!current)throw new Error('missing journal');const next=updater(current);journals.set(id,clone(next));return clone(next)},
    async getAudit(id){return clone(audits.get(id)||null)},
    async addAudit(audit){if(!audits.has(audit.id))audits.set(audit.id,clone(audit));return clone(audits.get(audit.id))},
    async markAuditUndone(id,patch){const current=audits.get(id);if(!current)throw new Error('missing audit');const next={...current,...clone(patch),undoAvailable:false};audits.set(id,next);return clone(next)},
  }
}

function versionedResource(expectedResource,initial,version=2){
  let state={value:clone(initial),version,record:{version,lastActionId:'',updatedBy:''}}
  return{
    snapshot:()=>clone(state),
    advance(value=state.value){state={value:clone(value),version:state.version+1,record:{version:state.version+1,lastActionId:'external-change',updatedBy:'Another editor'}}},
    async read(resource){assert.equal(resource,expectedResource);return clone(state)},
    async write(resource,value,expectedVersion,actor,mutationId=''){
      assert.equal(resource,expectedResource)
      if(state.version!==expectedVersion)throw Object.assign(new Error('version conflict'),{code:'VERSION_CONFLICT'})
      state={value:clone(value),version:state.version+1,record:{version:state.version+1,lastActionId:mutationId,updatedBy:actor}}
      return clone(state)
    },
  }
}

test('household editors stage reviewed proposals and never write their source or downstream projections directly',()=>{
  for(const source of [scheduleSource,maintenanceSource,inventorySource]){
    assert.match(source,/requestHouseholdActionReview/)
    assert.doesNotMatch(source,/localStorage\.setItem|writeSharedJson|publishHouseholdScheduleEvents|publishHouseholdOperationEvents|publishHouseholdFinanceBridge/)
  }
  assert.match(calendarSource,/householdScheduleCalendarEvents/)
  assert.match(calendarSource,/householdOperationCalendarEvents/)
  assert.match(calendarSource,/isHouseholdScheduleCalendarCopy/)
  assert.match(calendarSource,/isHouseholdOperationCalendarCopy/)
  assert.match(financeSource,/readHouseholdFinanceProjection/)
  assert.doesNotMatch(financeSource,/HOUSEHOLD_FINANCE_BRIDGE_KEY/)
})

test('household action review builders contain only intent and exact targets',()=>{
  const schedule=scheduleBlockCreateOperation({title:'Homework',date:'2026-09-07',startTime:'16:00',endTime:'17:00',owner:'Lorenzo',participants:['Nyla'],pillar:'Education',notes:''})
  assert.equal(schedule.type,'household.schedule.block.create')
  assert.equal(schedule.targetDate,'2026-09-07')
  assert.equal(schedule.payload.owner,'Lorenzo')
  assert.equal('createdBy' in schedule.payload,false)
  const inventory=inventoryItemCreateOperation({name:'Paper towels',category:'Paper Goods',location:'Supply Closet',quantity:'2',unit:'packs',parLevel:'1',unitCost:'12',expiresOn:'',notes:''})
  assert.equal(inventory.payload.unitCost,12)
  assert.equal(householdResourceKeyForAction(inventory.type),'brevity_household_inventory_v1')
  const custom=inventoryItemCreateOperation({name:'Light bulbs',category:'Other',location:'Other',locationCustom:'Basement storage',quantity:'2',unit:'boxes',parLevel:'1',unitCost:'9',expiresOn:'',notes:''})
  assert.equal(custom.payload.location,'Basement storage')
  assert.throws(()=>inventoryItemCreateOperation({name:'Light bulbs',category:'Other',location:'Other',locationCustom:'',quantity:'2',unit:'boxes',parLevel:'1',unitCost:'9'}),/custom storage location/i)
})

test('schedule mutation uses server actor/time/id and projects Calendar without a second record write',()=>{
  const operation=scheduleBlockCreateOperation({title:'Homework',date:'2026-09-07',startTime:'16:00',endTime:'17:00',owner:'Lorenzo',participants:['Nyla'],pillar:'Education',notes:'Algebra'})
  const result=applyHouseholdRecordOperation({},operation,{actor:'Lorenzo',now:()=>new Date('2026-09-07T20:00:00.000Z'),createId:()=> 'schedule-1'})
  assert.equal(result.after.blocks[0].id,'schedule-1')
  assert.equal(result.after.blocks[0].createdBy,'Lorenzo')
  assert.equal(result.after.blocks[0].attendance.Nyla,'pending')
  const events=householdScheduleCalendarEvents(result.after,{start:'2026-09-07',days:1})
  assert.equal(events.length,1)
  assert.equal(events[0].sourceId,'household-schedule-schedule-1')
  const storage={setItem(){throw new Error('must not write')},getItem(){throw new Error('must not read')}}
  assert.equal(publishHouseholdScheduleEvents(storage,result.after,1).blocked,true)
  assert.equal(publishHouseholdOperationEvents(storage,{},1).blocked,true)
})

test('maintenance transitions enforce responsible-member and verifier ownership',()=>{
  const task=buildHouseholdMaintenanceWeek(new Date('2026-09-07T12:00:00')).flatMap(day=>day.tasks).find(item=>item.owners.includes('Nyla'))
  assert.ok(task)
  const started=applyHouseholdRecordOperation({},maintenanceCompletionOperation(task,'start'),{actor:'Nyla',now:()=>new Date('2026-09-07T19:30:00.000Z')}).after
  assert.equal(started.occurrences[task.occurrenceId].startedBy,'Nyla')
  assert.equal(householdRecordForOperation(started,maintenanceCompletionOperation(task,'submit')).startedAt,'2026-09-07T19:30:00.000Z')
  const operation=maintenanceCompletionOperation(task,'submit')
  const current=householdRecordForOperation({},operation)
  assert.equal(householdPermissionForOperation({operation,member:'Nyla',role:'member',currentRecord:current}).allowed,true)
  assert.equal(householdPermissionForOperation({operation,member:'Lorenzo',role:'member',currentRecord:current}).allowed,false)
  const submitted=applyHouseholdRecordOperation({},operation,{actor:'Nyla',now:()=>new Date('2026-09-07T20:00:00.000Z')}).after
  const approval=maintenanceCompletionOperation(task,'approve')
  const submittedRecord=householdRecordForOperation(submitted,approval)
  assert.equal(householdPermissionForOperation({operation:approval,member:'Terica',role:'member',currentRecord:submittedRecord}).allowed,true)
  assert.equal(householdPermissionForOperation({operation:approval,member:'Nyla',role:'member',currentRecord:submittedRecord}).allowed,false)
  assert.equal(householdPermissionForOperation({operation,member:'Terica',role:'member',currentRecord:current}).allowed,false,'a verifier cannot submit another member’s responsibility')
  const approved=applyHouseholdRecordOperation(submitted,approval,{actor:'Terica',now:()=>new Date('2026-09-07T20:05:00.000Z')}).after
  assert.equal(approved.occurrences[task.occurrenceId].approvedBy,'Terica')
})

test('household review retries exact-version lookup after refreshing authoritative shared state',()=>{
  const source=readFileSync(new URL('./householdActionReview.js',import.meta.url),'utf8')
  assert.match(source,/error\?\.code!=='SHARED_STATE_VERSION_UNAVAILABLE'/)
  assert.match(source,/await syncSharedState\(storage\)/)
  assert.equal((source.match(/getAcknowledgedSharedStateVersion\(storage,key\)/g)||[]).length,2)
})

test('member schedule ownership cannot be transferred or deleted without administrator access',()=>{
  const current={id:'block-1',title:'Study',date:'2026-09-07',startTime:'16:00',endTime:'17:00',owner:'Nyla',participants:[]}
  const transfer={type:'household.schedule.block.update',targetId:current.id,targetDate:current.date,payload:{owner:'Lorenzo'}}
  const deletion={type:'household.schedule.block.delete',targetId:current.id,targetDate:current.date,payload:{}}
  assert.equal(householdPermissionForOperation({operation:transfer,member:'Nyla',role:'member',currentRecord:current}).allowed,false)
  assert.equal(householdPermissionForOperation({operation:deletion,member:'Nyla',role:'member',currentRecord:current}).allowed,false)
  assert.equal(householdPermissionForOperation({operation:deletion,member:'Larry',role:'admin',currentRecord:current}).allowed,true)
})

test('inventory adjustments and waste cannot invent quantity or override actor metadata',()=>{
  const create=inventoryItemCreateOperation({name:'Milk',category:'Refrigerator',location:'Refrigerator',quantity:'2',unit:'cartons',parLevel:'1',unitCost:'6',expiresOn:'2026-09-10',notes:''})
  const created=applyHouseholdRecordOperation({},create,{actor:'Nyla',now:()=>new Date('2026-09-07T12:00:00.000Z'),createId:()=> 'milk'}).after
  const item=created.items[0]
  const adjusted=applyHouseholdRecordOperation(created,inventoryQuantityOperation(item,-1),{actor:'Nyla',now:()=>new Date('2026-09-07T12:01:00.000Z')}).after
  assert.equal(adjusted.items[0].quantity,1)
  const wasted=applyHouseholdRecordOperation(adjusted,inventoryWasteOperation(adjusted.items[0],1,'Expired'),{actor:'Lorenzo',now:()=>new Date('2026-09-07T12:02:00.000Z'),createId:()=> 'waste-1'}).after
  assert.equal(wasted.items[0].quantity,0)
  assert.equal(wasted.waste[0].recordedBy,'Lorenzo')
  assert.throws(()=>applyHouseholdRecordOperation(adjusted,inventoryWasteOperation(adjusted.items[0],2,'Too much'),{actor:'Lorenzo'}),/cannot exceed inventory/)
  assert.deepEqual(created,clone(created),'operations leave reviewed input immutable')
})

test('household contract rejects spoofed metadata and groups each operation with its authoritative record',()=>{
  const operation=scheduleBlockCreateOperation({title:'Homework',date:'2026-09-07',startTime:'16:00',endTime:'17:00',owner:'Lorenzo',participants:[],pillar:'Education',notes:''})
  const proposal=normalizeActionProposal({summary:'Schedule homework',operations:[operation]},{member:'Lorenzo',role:'member',now:new Date('2026-09-07T18:00:00.000Z'),id:'household-contract'})
  assert.equal(proposal.operations[0].domain,'planning')
  assert.equal(proposal.operations[0].targetDate,'2026-09-07')
  assert.throws(()=>normalizeActionProposal({operations:[{...operation,payload:{...operation.payload,updatedBy:'Larry'}}]},{member:'Lorenzo',role:'member'}),/unsupported field: updatedBy/)
})

test('reviewed household Schedule change captures exact version, immutable audit, safe Undo, and stale protection',async()=>{
  const initial={version:1,blocks:[],routines:[],routineOverrides:{}}
  const resources=versionedResource('shared:brevity_household_schedule_v1',initial,2)
  const repository=memoryRepository(),session={member:'Lorenzo',role:'member'},permissions=defaultActionPermissions('member')
  const now=()=>new Date('2026-09-07T18:00:00.000Z')
  const operation=scheduleBlockCreateOperation({title:'Homework',date:'2026-09-07',startTime:'16:00',endTime:'17:00',owner:'Lorenzo',participants:['Nyla'],pillar:'Education',notes:'Algebra'})
  const proposal=await prepareDirectProposal({input:{summary:'Schedule homework',operation,expectedVersion:2},session,permissions,repository,resources,now:now(),id:'household-schedule-proposal'})
  assert.deepEqual(proposal.expectedVersions,{'shared:brevity_household_schedule_v1':2})
  assert.deepEqual(resources.snapshot().value,initial,'review preparation must not mutate Schedule')

  const execution=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,createAttemptId:()=> 'schedule-execute-attempt'})
  const created=resources.snapshot().value.blocks[0]
  assert.equal(created.owner,'Lorenzo')
  assert.equal(created.createdBy,'Lorenzo')
  assert.equal(created.createdAt,'2026-09-07T18:00:00.000Z')
  assert.equal(execution.audit.actor,'Lorenzo')
  assert.equal(execution.audit.occurredAt,'2026-09-07T18:00:00.000Z')
  assert.equal(execution.audit.undoAvailable,true)
  assert.deepEqual(execution.audit.changes[0].before,initial)
  assert.equal(execution.audit.changes[0].after.blocks[0].title,'Homework')

  await undoActionWithJournal({repository,auditId:execution.audit.id,session,resources,event:{},now,createAttemptId:()=> 'schedule-undo-attempt'})
  assert.deepEqual(resources.snapshot().value,initial)

  await assert.rejects(()=>prepareDirectProposal({
    input:{summary:'Stale schedule review',operation,expectedVersion:2},session,permissions,repository,resources,now:now(),id:'stale-household-schedule',
  }),error=>error?.code==='VERSION_CONFLICT')
})

test('household execution and Undo recheck planning permission and stop on a newer resource version',async()=>{
  const initial={version:1,items:[],waste:[]}
  const resources=versionedResource('shared:brevity_household_inventory_v1',initial,4)
  const repository=memoryRepository(),session={member:'Nyla',role:'member'},permissions=defaultActionPermissions('member')
  const now=()=>new Date('2026-09-07T19:00:00.000Z')
  const operation=inventoryItemCreateOperation({name:'Paper towels',category:'Paper Goods',location:'Supply Closet',quantity:'2',unit:'packs',parLevel:'1',unitCost:'12',expiresOn:'',notes:''})
  await assert.rejects(()=>prepareDirectProposal({input:{summary:'Blocked inventory',operation,expectedVersion:4},session,permissions:{...permissions,planning:false},repository,resources,now:now(),id:'blocked-inventory'}),error=>error?.code==='FORBIDDEN')
  const proposal=await prepareDirectProposal({input:{summary:'Add paper towels',operation,expectedVersion:4},session,permissions,repository,resources,now:now(),id:'inventory-proposal'})
  const execution=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},now,createAttemptId:()=> 'inventory-execute-attempt'})
  resources.advance({...resources.snapshot().value,externalNote:'newer authoritative edit'})
  await assert.rejects(()=>undoActionWithJournal({repository,auditId:execution.audit.id,session,resources,event:{},now,createAttemptId:()=> 'inventory-undo-attempt'}),error=>error?.code==='VERSION_CONFLICT')
  assert.equal(resources.snapshot().value.externalNote,'newer authoritative edit')
  assert.equal((await repository.getAudit(execution.audit.id)).undoAvailable,true)
})

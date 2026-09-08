import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultActionPermissions } from '../../netlify/lib/assistant-action-contract.mjs'
import { resourceForOperation } from '../../netlify/lib/assistant-action-executor.mjs'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { executeActionWithJournal, prepareDirectProposal, undoActionWithJournal } from '../../netlify/functions/brevity-assistant-actions.mjs'
import {
  meetingActionCreateOperation,
  meetingActionOperation,
  meetingCorrectionCreateOperation,
  meetingCorrectionOperation,
  meetingHistoryOperation,
  meetingSessionCreateOperation,
  meetingWorkspaceOperation,
  requestMeetingActionReview,
} from './meetingActionReview.js'

function versionedBlobStore(){
  const values=new Map()
  let sequence=0
  const clone=value=>value==null?value:structuredClone(value)
  return{
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

const action={id:'commitment-1',text:'Jabin will send dates',owner:'Jabin',due:'2026-09-10',status:'open'}
const correction={id:'correction-1',label:'cash on hand',value:'286',reason:'Legacy note',source:'Proposed',scope:'this occurrence',status:'proposed',origin:'meeting transcript'}
const meeting={id:'meeting-1',cadence:'weekly',summary:'Old summary',notes:'Old notes',transcript:'Old transcript'}

test('Finance Meeting editors produce exact, minimal reviewed operations',()=>{
  const actionOperation=meetingActionOperation(action,{...action,text:'Javin will send dates',owner:'Javin'})
  assert.equal(actionOperation.type,'meeting.action.update')
  assert.deepEqual(actionOperation.payload,{text:'Javin will send dates',owner:'Javin'})
  assert.equal(resourceForOperation({...actionOperation,domain:'finance'}),'shared:brevity_finance_meetings_v1')

  const correctionOperation=meetingCorrectionOperation(correction,{...correction,label:'Operating cash',value:'300',status:'approved'})
  assert.deepEqual(correctionOperation.payload,{label:'Operating cash',value:'300',status:'approved'})

  const sourcedLegacyCorrection=meetingCorrectionOperation({...correction,origin:''},{...correction,origin:'Verified against the September 7 operating-account statement'})
  assert.deepEqual(sourcedLegacyCorrection.payload,{origin:'Verified against the September 7 operating-account statement'})

  const historyOperation=meetingHistoryOperation(meeting,{...meeting,summary:'New summary',transcript:'Line one\nLine two'})
  assert.deepEqual(historyOperation.payload,{summary:'New summary',transcript:'Line one\nLine two'})
  assert.throws(()=>meetingHistoryOperation(meeting,{...meeting}),/Change at least one field/)
})

test('new commitments, corrections, session results, and guidance become bounded reviewed operations',()=>{
  const actionCreate=meetingActionCreateOperation({text:'Jabin will call Tarrica',owner:'Jabin',due:'2026-09-10'},{cadence:'weekly',date:'2026-09-07'})
  assert.equal(actionCreate.type,'meeting.action.create')
  assert.equal(actionCreate.payload.text,'Javin will call Terica')
  assert.equal(actionCreate.payload.owner,'Javin')

  const correctionCreate=meetingCorrectionCreateOperation({label:'Operating cash',value:'300',source:'User Confirmed',scope:'this occurrence'},{cadence:'weekly',date:'2026-09-07'})
  assert.equal(correctionCreate.type,'meeting.correction.create')
  assert.equal(correctionCreate.payload.status,'proposed')

  const session=meetingSessionCreateOperation({
    cadence:'weekly',meetingDate:'2026-09-07',startedAt:'2026-09-07T13:00:00.000Z',endedAt:'2026-09-07T13:15:00.000Z',summary:'Cash reviewed',transcript:'Jabin will call Tara.',
    actions:[{text:'Jabin will call Tara.',owner:'Jabin',due:'2026-09-10'}],corrections:[{label:'Cash',value:'300',source:'Proposed',scope:'this occurrence'}],
  })
  assert.equal(session.type,'meeting.session.create')
  assert.equal(session.payload.actions[0].text,'Javin will call Terica.')
  assert.deepEqual(meetingWorkspaceOperation({kind:'month-status',value:'green'}),{type:'meeting.workspace.update',targetId:'snapshot',payload:{monthStatus:'green'},description:'Set the Finance Meeting month status to green.'})
})

test('reviewed meeting finalization atomically records extracted results and safely undoes',async()=>{
  const store=versionedBlobStore(),instant=new Date('2026-09-07T13:15:00Z')
  const repository=createAssistantActionRepository({store,householdId:'meeting-session-house',now:()=>instant})
  let value={openActions:[],corrections:[],meetings:[],snapshot:{monthStatus:'yellow'}},version=2,record={updatedBy:'seed',lastActionId:''}
  const resources={
    read:async()=>({value:structuredClone(value),version,record}),
    write:async(resource,next,expected,actor,mutationId)=>{assert.equal(expected,version);version+=1;value=structuredClone(next);record={updatedBy:actor,lastActionId:mutationId};return{value:structuredClone(value),version}},
  }
  const operation=meetingSessionCreateOperation({
    cadence:'weekly',meetingDate:'2026-09-07',startedAt:'2026-09-07T13:00:00.000Z',endedAt:'2026-09-07T13:15:00.000Z',summary:'Reviewed cash',notes:'Follow up',transcript:'Javin will send dates.',
    actions:[{text:'Javin will send dates.',owner:'Javin',due:'2026-09-10'}],corrections:[{label:'Operating cash',value:'300',source:'Proposed',scope:'this occurrence'}],
  })
  const proposal=await prepareDirectProposal({input:{summary:'Finalize meeting',operation,expectedVersion:2},session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources,now:instant,id:'meeting-session'})
  const executed=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0,now:()=>instant})
  assert.equal(value.meetings.length,1)
  assert.equal(value.openActions[0].text,'Javin will send dates.')
  assert.equal(value.corrections[0].status,'proposed')
  assert.equal(value.meetings[0].createdBy,'Larry')
  assert.equal(executed.audit.changes[0].before.meetings.length,0)
  assert.equal(executed.audit.undoAvailable,true)

  await undoActionWithJournal({repository,auditId:executed.audit.id,session:{member:'Larry',role:'admin'},resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T13:16:00Z')})
  assert.deepEqual(value.meetings,[])
  assert.deepEqual(value.openActions,[])
  assert.deepEqual(value.corrections,[])
})

test('direct Finance Meeting review enforces the exact shared version and separates planning from financial authority',async()=>{
  const saved=[]
  const repository={saveProposal:async proposal=>{saved.push(proposal);return proposal}}
  const resources={read:async()=>({value:{openActions:[action],corrections:[correction],meetings:[meeting]},version:4,record:{}})}
  const input={summary:'Edit commitment',expectedVersion:4,operation:meetingActionOperation(action,{...action,text:'Javin will send dates'})}
  const proposal=await prepareDirectProposal({input,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources,now:new Date('2026-09-07T13:00:00Z'),id:'meeting-review'})
  assert.equal(proposal.expectedVersions['shared:brevity_finance_meetings_v1'],4)
  assert.equal(saved.length,1)

  await assert.rejects(()=>prepareDirectProposal({...{input:{...input,expectedVersion:3},session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources}}),error=>error.code==='VERSION_CONFLICT')
  const memberProposal=await prepareDirectProposal({input,session:{member:'Lorenzo',role:'member'},permissions:defaultActionPermissions('member'),repository,resources,id:'member-meeting-review'})
  assert.equal(memberProposal.expectedVersions['shared:brevity_finance_meetings_v1'],4)

  const correctionInput={summary:'Edit financial correction',expectedVersion:4,operation:meetingCorrectionOperation(correction,{...correction,value:'300'})}
  await assert.rejects(()=>prepareDirectProposal({input:correctionInput,session:{member:'Lorenzo',role:'member'},permissions:{...defaultActionPermissions('member'),finance:true},repository,resources}),error=>error.code==='FORBIDDEN')

  const financialEffect=meetingActionCreateOperation({text:'Call provider',owner:'Lorenzo',financialEffect:'Reduce expense by $100'},{cadence:'weekly',date:'2026-09-07'})
  await assert.rejects(()=>prepareDirectProposal({input:{summary:'Financial commitment',expectedVersion:4,operation:financialEffect},session:{member:'Lorenzo',role:'member'},permissions:defaultActionPermissions('member'),repository,resources}),error=>error.code==='FORBIDDEN')
})

test('Finance Meeting review fails closed for an unacknowledged local record',async()=>{
  const storage={getItem:key=>key==='brevity_finance_meetings_v1'?JSON.stringify({openActions:[action]}):null}
  await assert.rejects(
    ()=>requestMeetingActionReview({summary:'Unsafe local edit',operation:meetingActionOperation(action,{...action,text:'Unsynchronized edit'}),storage}),
    /not durably synchronized/,
  )
})

test('reviewed Finance Meeting mutation records immutable before/after and safely undoes',async()=>{
  const store=versionedBlobStore()
  const instant=new Date('2026-09-07T13:15:00Z')
  const repository=createAssistantActionRepository({store,householdId:'meeting-house',now:()=>instant})
  let value={openActions:[action],corrections:[correction],meetings:[meeting]},version=4,record={updatedBy:'seed',lastActionId:''}
  const resources={
    read:async()=>({value:structuredClone(value),version,record}),
    write:async(resource,next,expected,actor,mutationId)=>{
      assert.equal(resource,'shared:brevity_finance_meetings_v1')
      assert.equal(expected,version)
      version+=1;value=structuredClone(next);record={updatedBy:actor,lastActionId:mutationId}
      return{value:structuredClone(value),version}
    },
  }
  const rawOperation=meetingActionOperation(action,{...action,text:'Javin will send corrected dates',owner:'Javin'})
  const proposal=await prepareDirectProposal({input:{summary:'Correct commitment',operation:rawOperation,expectedVersion:4},session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources,now:instant,id:'meeting-edit'})
  const operation={...proposal.operations[0],selectedScope:'this-item'}
  const executed=await executeActionWithJournal({repository,proposal,operations:[operation],session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0,now:()=>instant})
  assert.equal(value.openActions[0].text,'Javin will send corrected dates')
  assert.equal(value.openActions[0].updatedBy,'Larry')
  assert.equal(executed.audit.actor,'Larry')
  assert.equal(executed.audit.occurredAt,instant.toISOString())
  assert.equal(executed.audit.changes[0].before.openActions[0].text,'Jabin will send dates')
  assert.equal(executed.audit.changes[0].after.openActions[0].text,'Javin will send corrected dates')
  assert.equal(executed.audit.undoAvailable,true)

  await undoActionWithJournal({repository,auditId:executed.audit.id,session:{member:'Larry',role:'admin'},resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T13:16:00Z')})
  assert.equal(value.openActions[0].text,'Jabin will send dates')
  assert.equal((await repository.getAudit(executed.audit.id)).undoAvailable,false)
})

test('Finance Meeting storage failure creates no successful audit and a newer version blocks the edit',async()=>{
  const store=versionedBlobStore()
  const repository=createAssistantActionRepository({store,householdId:'meeting-failure'})
  let version=7,value={openActions:[action],corrections:[],meetings:[]}
  const resources={read:async()=>({value:structuredClone(value),version,record:{lastActionId:''}}),write:async()=>{throw new Error('meeting storage unavailable')}}
  const rawOperation=meetingActionOperation(action,{...action,text:'Javin owns dates'})
  const proposal=await prepareDirectProposal({input:{summary:'Edit commitment',operation:rawOperation,expectedVersion:7},session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),repository,resources,id:'meeting-failure'})
  version=8
  await assert.rejects(()=>executeActionWithJournal({repository,proposal,operations:proposal.operations,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0}),error=>error.code==='VERSION_CONFLICT')
  assert.equal((await repository.history()).length,0)

  version=7
  await assert.rejects(()=>executeActionWithJournal({repository,proposal:{...proposal,id:'meeting-storage-failure'},operations:proposal.operations,session:{member:'Larry',role:'admin'},permissions:defaultActionPermissions('admin'),resources,event:{},leaseMs:0}),/meeting storage unavailable/)
  assert.equal((await repository.history()).length,0)
})

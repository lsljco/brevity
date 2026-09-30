import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareProjectCalendarProposal,executeActionWithJournal,undoActionWithJournal,prepareCalendarOperations} from '../../netlify/functions/brevity-assistant-actions.mjs'
import {normalizeActionProposal,defaultActionPermissions} from '../../netlify/lib/assistant-action-contract.mjs'
const clone=value=>structuredClone(value)
const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin')
function fixture(){
  const projects=[{id:'trees',title:'Plant trees',startDate:'2026-10-01',due:'2026-10-03',pushToFamilyCalendar:true,priority:'Medium',raci:{responsible:['Larry']}}]
  let version=4,events=[],writes=0,failAfterWrite=false,beforeWrite=null
  const journals=new Map(),audits=new Map()
  const repository={async saveProposal(p){return p},async getJournalEntry(id){return{journal:clone(journals.get(id)||null)}},async ensureJournal(j){if(!journals.has(j.id))journals.set(j.id,clone(j));return clone(journals.get(j.id))},async updateJournal(id,fn){const j=fn(clone(journals.get(id)));journals.set(id,clone(j));return j},async getAudit(id){return clone(audits.get(id)||null)},async addAudit(a){if(!audits.has(a.id))audits.set(a.id,clone(a));return clone(audits.get(a.id))},async markAuditUndone(id,patch){audits.set(id,{...audits.get(id),...patch,undoAvailable:false})},async getPermissions(){return{Larry:permissions}}}
  const resources={async read(key){assert.equal(key,'shared:homehq_items_v1');if(beforeWrite){const run=beforeWrite;beforeWrite=null;run()}return{value:clone(projects),version}},async write(){assert.fail('Publication must not write the source project')}}
  const calendarRequestFn=async(_event,method,body)=>{
    if(method==='GET')return{events:clone(events)}
    writes++
    if(method==='DELETE'){events=events.filter(e=>e.href!==body.href);return{ok:true}}
    const updated={...body,id:body.id||'apple-trees',uid:body.uid||body.id||'apple-trees',href:body.href||'/trees.ics',etag:`etag-${writes}`}
    if(method==='POST')events.push(updated)
    else events=events.map(e=>e.href===body.href?updated:e)
    if(failAfterWrite){failAfterWrite=false;throw Error('response lost')}
    return clone(updated)
  }
  const prepare=(intent='publish',extra={})=>prepareProjectCalendarProposal({input:{projectId:'trees',expectedVersion:version,intent},session,events:clone(events),repository,resources,id:`proposal-${writes}-${intent}`,now:new Date('2026-09-30T22:00:00Z'),...extra})
  const execute=proposal=>executeActionWithJournal({proposal,operations:proposal.operations,repository,resources,session,permissions,event:{},calendarRequestFn,leaseMs:0})
  const undo=audit=>undoActionWithJournal({auditId:audit.id,repository,resources,session,permissions,event:{},calendarRequestFn,leaseMs:0})
  return{projects,prepare,execute,undo,repository,resources,calendarRequestFn,events:()=>events,writes:()=>writes,setEvents:v=>{events=v},change:()=>{version++},fail:()=>{failAfterWrite=true},onRead:fn=>{beforeWrite=fn}}
}
test('project Apple publication uses exact source ID, reviewed dates and external-only audit/Undo',async()=>{
  const f=fixture();f.setEvents([{id:'unrelated',sourceId:'other-id',title:'Plant trees',date:'2026-10-01',href:'/unrelated.ics',etag:'u1'}])
  const p=await f.prepare();assert.equal(f.writes(),0);assert.equal(p.operations[0].type,'calendar.create')
  const {audit}=await f.execute(p)
  assert.equal(f.events().length,2);assert.equal(f.events()[1].sourceId,'project-trees');assert.equal(f.events()[1].endDate,'2026-10-03');assert.equal(f.events()[1].priority,false)
  assert.equal(audit.changes.length,1);assert.equal(audit.changes[0].resource,'calendar:apple-family')
  await f.undo(audit);assert.equal(f.events().length,1);assert.equal(f.events()[0].id,'unrelated');assert.equal(f.projects.length,1)
})
test('project Apple publication recovers a lost response after source edits without a duplicate write',async()=>{
  const f=fixture(),p=await f.prepare();f.fail()
  await assert.rejects(()=>f.execute(p),/response lost/);f.change()
  const result=await f.execute(p);assert.equal(f.writes(),1);assert.equal(result.audit.changes[0].after.sourceId,'project-trees')
})
test('project source changes after review block Apple writes',async()=>{
  const f=fixture(),p=await f.prepare();f.change()
  await assert.rejects(()=>f.execute(p),e=>e.code==='VERSION_CONFLICT');assert.equal(f.writes(),0)
})
test('project publication updates only the exact source, and newer Apple edits prevent Undo',async()=>{
  const f=fixture();await f.execute(await f.prepare());f.projects[0].title='Renamed trees';f.change()
  const p=await f.prepare();assert.equal(p.operations[0].type,'calendar.update')
  const {audit}=await f.execute(p);assert.equal(f.events().length,1);assert.equal(f.events()[0].title,'Renamed trees');assert.equal(f.events()[0].priority,false)
  f.events()[0].etag='newer-external-edit'
  await assert.rejects(()=>f.undo(audit),e=>e.code==='VERSION_CONFLICT')
})
test('project publication requires administrator, valid opted-in source, and unambiguous identity',async()=>{
  const f=fixture()
  await assert.rejects(()=>f.prepare('publish',{session:{member:'Nyla',role:'member'}}),e=>e.code==='FORBIDDEN')
  f.projects[0].pushToFamilyCalendar=false;await assert.rejects(()=>f.prepare(),/enable Family Calendar/)
  f.projects[0].pushToFamilyCalendar=true;f.projects[0].startDate='2026-02-30';await assert.rejects(()=>f.prepare(),/valid project dates/)
  f.setEvents([{sourceId:'project-trees'},{sourceId:'project-trees'}]);await assert.rejects(()=>f.prepare(),/Multiple Apple events/)
  assert.equal(f.writes(),0)
})
test('Apple removal is strongly reviewed and can be undone without touching a deleted source project',async()=>{
  const f=fixture();await f.execute(await f.prepare());f.projects.splice(0);f.change()
  const p=await f.prepare('remove');assert.equal(p.risk,'strong-confirmation')
  const {audit}=await f.execute(p);assert.equal(f.events().length,0)
  await f.undo(audit);assert.equal(f.events().length,1);assert.equal(f.projects.length,0)
})
test('generic calendar actions cannot modify a managed project publication or inject source metadata',async()=>{
  const f=fixture();await f.execute(await f.prepare())
  const proposal=normalizeActionProposal({operations:[{type:'calendar.update',targetId:f.events()[0].id,description:'Bypass source',payload:{title:'Wrong'},projectSource:{id:'trees',version:4}}]},{member:'Larry',role:'admin'})
  assert.equal(proposal.operations[0].projectSource,undefined)
  await assert.rejects(()=>prepareCalendarOperations({event:{},operations:proposal.operations,session,permissions,calendarRequestFn:f.calendarRequestFn}),e=>e.code==='FORBIDDEN')
})

test('a source change between journal preparation and the external write stops publication',async()=>{
  const f=fixture(),p=await f.prepare(),read=f.resources.read
  let reads=0
  f.resources.read=async key=>{if(++reads===2)f.change();return read(key)}
  await assert.rejects(()=>f.execute(p),e=>e.code==='VERSION_CONFLICT')
  assert.equal(f.writes(),0)
})

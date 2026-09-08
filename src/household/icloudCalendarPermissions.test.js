import assert from 'node:assert/strict'
import test from 'node:test'
import { actionCalendarUid, authorizeUntrustedSourceMutation, calendarMutationDomain, calendarMutationPermission, createICloudCalendarHandler, deleteCalendarEventWithIntent, makeIcs, parseEvent, putCalendarEventIdempotently, putCalendarUpdateWithFreshEtag, resolveAuthoritativeCalendarSource } from '../../netlify/functions/icloud-calendar.mjs'
import { createICloudCalendarEvent, deleteICloudCalendarEvent, updateICloudCalendarEvent } from '../family/icloudCalendarApi.js'

const member = { member:'Nyla', role:'member' }
const enabled = { planning:true, calendar:true, projects:true, finance:false }

const endpointEvent = ({ method = 'GET', body, reviewed = false, action } = {}) => ({
  httpMethod:method,
  headers:reviewed ? { 'x-test-reviewed':'yes' } : {},
  queryStringParameters:action ? { action } : {},
  body:body == null ? undefined : JSON.stringify(body),
})

test('direct authenticated calendar mutations fail closed before discovery, storage, or CalDAV', async () => {
  let discoveryCalls=0,repositoryCalls=0,calendarCalls=0
  const handler=createICloudCalendarHandler({
    authenticate:async()=>({member:'Larry',role:'admin'}),
    isTrustedAction:()=>false,
    calendarDiscovery:async()=>{discoveryCalls+=1;throw new Error('must not discover')},
    actionRepositoryFactory:()=>{repositoryCalls+=1;throw new Error('must not open Action storage')},
    calendarTransport:async()=>{calendarCalls+=1;throw new Error('must not call Apple')},
  })
  for(const method of ['POST','PUT','DELETE']){
    const response=await handler(endpointEvent({method,body:{title:'Unreviewed change'}}))
    assert.equal(response.statusCode,423)
    const payload=JSON.parse(response.body)
    assert.equal(payload.code,'ACTION_REVIEW_REQUIRED')
    assert.match(payload.error,/No Apple Calendar records were changed/i)
  }
  assert.equal(discoveryCalls,0)
  assert.equal(repositoryCalls,0)
  assert.equal(calendarCalls,0)
})

test('browser mutation helpers reject locally while authenticated calendar refresh remains a server GET', async () => {
  const originalFetch=global.fetch
  let fetchCalls=0
  global.fetch=async()=>{fetchCalls+=1;throw new Error('must not fetch')}
  try{
    for(const operation of [createICloudCalendarEvent,updateICloudCalendarEvent,deleteICloudCalendarEvent]){
      await assert.rejects(operation({title:'Unreviewed'}),error=>error.status===423&&error.code==='ACTION_REVIEW_REQUIRED')
    }
    assert.equal(fetchCalls,0)
  }finally{global.fetch=originalFetch}
})

test('authenticated calendar refresh remains read-only and available',async()=>{
  let listed=0,repositoryCalls=0,calendarCalls=0
  const handler=createICloudCalendarHandler({
    authenticate:async()=>({member:'Nyla',role:'member'}),
    calendarDiscovery:async()=>({url:'https://p01-caldav.icloud.com/family/',name:'Family',discoveryMode:'principal'}),
    eventLister:async()=>{listed+=1;return{events:[{id:'apple-one',title:'Dinner'}],recurrenceMode:'expanded'}},
    actionRepositoryFactory:()=>{repositoryCalls+=1},
    calendarTransport:async()=>{calendarCalls+=1},
  })
  const response=await handler(endpointEvent())
  assert.equal(response.statusCode,200)
  const payload=JSON.parse(response.body)
  assert.equal(payload.syncMode,'action-reviewed')
  assert.equal(payload.events[0].title,'Dinner')
  assert.equal(listed,1)
  assert.equal(repositoryCalls,0)
  assert.equal(calendarCalls,0)
})

test('reviewed Action Calendar create, edit, and delete retain their protected server path', async () => {
  const current={id:'apple-one',uid:'apple-one',sourceId:'assistant-calendar-one',actionId:'execute-original',title:'Family dinner',date:'2026-09-08',time:'',allDay:true,pillar:'household',owner:'Larry',participants:[],notes:'',priority:false,href:'/family/apple-one.ics',etag:'etag-one'}
  let events=[]
  const calls=[]
  const receipts=[]
  const handler=createICloudCalendarHandler({
    authenticate:async()=>({member:'Larry',role:'admin'}),
    isTrustedAction:event=>Boolean(event.headers?.['x-test-reviewed']),
    calendarDiscovery:async()=>({url:'https://p01-caldav.icloud.com/family/',name:'Family',discoveryMode:'principal'}),
    eventLister:async()=>({events,recurrenceMode:'expanded'}),
    actionRepositoryFactory:()=>({
      getPermissions:async()=>({Larry:{planning:true,calendar:true,projects:true,finance:true}}),
      saveCalendarMutationReceipt:async receipt=>{receipts.push(receipt);return receipt},
      getCalendarMutationReceipt:async()=>null,
    }),
    calendarTransport:async(url,method,body,headers)=>{
      calls.push({url,method,body,headers})
      return{response:{url,headers:{get:name=>name.toLowerCase()==='etag'?`etag-${calls.length+1}`:''}},text:''}
    },
  })
  const createItem={sourceId:'assistant-calendar-one',actionId:'execute-create',title:'Family dinner',date:'2026-09-08',time:'',allDay:true,pillar:'household',owner:'Larry',participants:[],notes:'',priority:false}
  const created=await handler(endpointEvent({method:'POST',body:createItem,reviewed:true}))
  assert.equal(created.statusCode,201)
  assert.equal(calls.at(-1).method,'PUT')
  assert.deepEqual(calls.at(-1).headers,{'if-none-match':'*'})

  events=[current]
  const updated=await handler(endpointEvent({method:'PUT',reviewed:true,body:{...current,actionId:'execute-update',title:'Updated family dinner'}}))
  assert.equal(updated.statusCode,200)
  assert.equal(calls.at(-1).method,'PUT')
  assert.deepEqual(calls.at(-1).headers,{'if-match':'etag-one'})

  const deleted=await handler(endpointEvent({method:'DELETE',reviewed:true,body:{...current,actionId:'undo-reviewed-delete'}}))
  assert.equal(deleted.statusCode,200)
  assert.equal(receipts.length,1)
  assert.equal(receipts[0].reviewedEtag,'etag-one')
  assert.equal(calls.at(-1).method,'DELETE')
  assert.deepEqual(calls.at(-1).headers,{'if-match':'etag-one'})
})

test('calendar mutations use the permission domain of their authoritative source', () => {
  assert.equal(calendarMutationDomain({ sourceId:'daily-2026-09-07-action' }), 'planning')
  assert.equal(calendarMutationDomain({ sourceId:'project-kitchen' }), 'projects')
  assert.equal(calendarMutationDomain({ sourceId:'estate-maintenance-event-1' }), 'projects')
  assert.equal(calendarMutationDomain({ sourceId:'household-operation-kitchen-2026-09-07' }), 'planning')
  assert.equal(calendarMutationDomain({ sourceId:'finance-action-review-electric' }), 'finance')
  assert.equal(calendarMutationDomain({ sourceId:'assistant-calendar-1' }), 'calendar')

  assert.equal(calendarMutationPermission({ session:member, permissions:{ ...enabled, planning:false }, method:'POST', item:{ sourceId:'daily-2026-09-07-action', owner:'Family' } }).allowed, false)
  assert.equal(calendarMutationPermission({ session:member, permissions:{ ...enabled, projects:false }, method:'PUT', current:{ sourceId:'project-kitchen', owner:'Family' } }).allowed, false)
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'DELETE', current:{ sourceId:'project-kitchen', owner:'Larry' } }).allowed, true)
})

test('direct calendar mutations enforce member ownership and administrator-only deletion', () => {
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'POST', item:{ sourceId:'', owner:'Nyla' } }).allowed, false)
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'PUT', current:{ sourceId:'native-apple', owner:'Nyla' } }).allowed, false)
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'POST', item:{ sourceId:'assistant-one', owner:'Larry' } }).allowed, false)
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'PUT', current:{ sourceId:'assistant-one', owner:'Nyla', participants:['Nyla'] } }).allowed, false)
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'PUT', current:{ sourceId:'assistant-one', owner:'Larry', participants:['Nyla'] }, trustedAction:true }).allowed, true)
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'PUT', current:{ sourceId:'assistant-one', owner:'Larry', participants:[] }, trustedAction:true }).allowed, false)
  assert.equal(calendarMutationPermission({ session:member, permissions:enabled, method:'DELETE', current:{ sourceId:'assistant-one', owner:'Nyla' }, trustedAction:true }).allowed, false)
  assert.equal(calendarMutationPermission({ session:{ member:'Larry', role:'admin' }, permissions:{ planning:false, calendar:false, projects:false }, method:'DELETE', current:{ sourceId:'assistant-one', owner:'Nyla' } }).allowed, true)
})

test('untrusted browser source identifiers cannot substitute for authoritative records', async () => {
  const canonical={sourceId:'daily-2026-09-07-task-one',title:'Family appointment',date:'2026-09-07',allDay:true,pillar:'household',owner:'Family',participants:['Nyla'],priority:false,notes:''}
  const resolver=async sourceId=>({supported:sourceId.startsWith('daily-'),event:canonical})
  assert.equal((await authorizeUntrustedSourceMutation({method:'POST',item:canonical,resolver})).allowed,true)
  assert.equal((await authorizeUntrustedSourceMutation({method:'POST',item:{...canonical,title:'Forged title'},resolver})).allowed,false)
  assert.equal((await authorizeUntrustedSourceMutation({method:'POST',item:{...canonical,sourceId:'assistant-forged'},resolver})).allowed,false)
  assert.equal((await authorizeUntrustedSourceMutation({method:'PUT',current:canonical,item:{...canonical,sourceId:'daily-2026-09-07-other'},resolver})).allowed,false)
  const legacy={...canonical,sourceId:'task-one'}
  const scoped={...canonical,sourceId:'daily-2026-09-07-task-one'}
  assert.equal((await authorizeUntrustedSourceMutation({method:'PUT',current:legacy,item:scoped,resolver:async sourceId=>({supported:sourceId===scoped.sourceId,event:scoped})})).allowed,true)
})

test('untrusted deletion is allowed only after the authoritative source removed the item', async () => {
  const current={sourceId:'project-kitchen',title:'Kitchen',date:'2026-09-08',allDay:true,owner:'Family'}
  const exists=await authorizeUntrustedSourceMutation({method:'DELETE',current,resolver:async()=>({supported:true,event:current})})
  const removed=await authorizeUntrustedSourceMutation({method:'DELETE',current,resolver:async()=>({supported:true,event:null})})
  assert.equal(exists.allowed,false)
  assert.equal(removed.allowed,true)
})

test('authoritative source resolution reads daily plans and shared projects', async () => {
  const planStore={get:async()=>({household:{appointments:[{id:'doctor',title:'Doctor',date:'2026-09-07',calendarSync:true,owner:'Nyla'}]}})}
  const daily=await resolveAuthoritativeCalendarSource('daily-2026-09-07-doctor',{planStore})
  assert.equal(daily.supported,true)
  assert.equal(daily.event.title,'Doctor')

  const sharedStore={get:async()=>({value:JSON.stringify([{id:'kitchen',title:'Kitchen',startDate:'2026-09-08',due:'2026-09-12',pushToFamilyCalendar:true,raci:{responsible:['Nyla']}}])})}
  const project=await resolveAuthoritativeCalendarSource('project-kitchen',{sharedStore})
  assert.equal(project.supported,true)
  assert.equal(project.event.owner,'Nyla')
  assert.equal((await resolveAuthoritativeCalendarSource('household-operation-kitchen',{sharedStore})).supported,false)
})

test('Brevity calendar records retain the deterministic Action Mode mutation id',()=>{
  const ics=makeIcs({sourceId:'assistant-one',actionId:'execute-proposal-one',title:'Dinner',date:'2026-09-08',allDay:true,owner:'Larry'},'event-one')
  const parsed=parseEvent(ics,'/event-one.ics','etag-one')
  assert.equal(parsed.actionId,'execute-proposal-one')
  assert.equal(parsed.sourceId,'assistant-one')
})

test('timed Calendar records preserve their reviewed all-day semantics',()=>{
  const parsed=parseEvent(makeIcs({sourceId:'assistant-one',actionId:'execute-one',title:'Dinner',date:'2026-09-08',time:'7:00 PM',allDay:false,owner:'Larry'},'event-one'),'/event-one.ics','etag-one')
  assert.equal(parsed.allDay,false)
  assert.match(parsed.time,/7:00\s*PM/i)
})

test('Action Mode Calendar identity is stable per mutation and source',()=>{
  const first=actionCalendarUid({actionId:'execute-proposal-one',sourceId:'assistant-one'})
  assert.equal(first,actionCalendarUid({actionId:'execute-proposal-one',sourceId:'assistant-one'}))
  assert.notEqual(first,actionCalendarUid({actionId:'execute-proposal-two',sourceId:'assistant-one'}))
  assert.notEqual(first,actionCalendarUid({actionId:'execute-proposal-one',sourceId:'assistant-two'}))
})

function atomicCalendarRequest() {
  const records=new Map()
  let writes=0
  const headers=etag=>({get:name=>name.toLowerCase()==='etag'?etag:null})
  return{
    records,
    get writes(){return writes},
    async request(url,method,body,_headers={}){
      if(method==='PUT'){
        if(records.has(url))throw Object.assign(new Error('precondition failed'),{status:412})
        writes+=1
        const record={body,etag:`etag-${writes}`};records.set(url,record)
        return{response:{url,headers:headers(record.etag)},text:''}
      }
      if(method==='GET'){
        const record=records.get(url)
        if(!record)throw Object.assign(new Error('not found'),{status:404})
        return{response:{url,headers:headers(record.etag)},text:record.body}
      }
      throw new Error(`Unexpected ${method}`)
    },
  }
}

test('concurrent trusted Calendar creates converge on one deterministic Apple resource',async()=>{
  const server=atomicCalendarRequest()
  const item={sourceId:'assistant-one',actionId:'execute-proposal-one',title:'Dinner',date:'2026-09-08',time:'',allDay:true,pillar:'household',owner:'Larry',participants:[],notes:'',priority:false}
  const uid=actionCalendarUid(item),href=`https://caldav.example/family/${encodeURIComponent(uid)}.ics`
  const create=()=>putCalendarEventIdempotently({item,uid,href,trustedAction:true,request:server.request})
  const results=await Promise.all([create(),create()])
  assert.equal(server.writes,1)
  assert.equal(server.records.size,1)
  assert.deepEqual(results.map(result=>result.payload.id),[uid,uid])
  assert.equal(results.some(result=>result.payload.recovered),true)
})

test('trusted Calendar create recovery rejects a different occupant without overwriting it',async()=>{
  const server=atomicCalendarRequest()
  const item={sourceId:'assistant-one',actionId:'execute-proposal-one',title:'Dinner',date:'2026-09-08',time:'',allDay:true,pillar:'household',owner:'Larry',participants:[],notes:'',priority:false}
  const uid=actionCalendarUid(item),href=`https://caldav.example/family/${encodeURIComponent(uid)}.ics`
  await server.request(href,'PUT',makeIcs({...item,title:'Different event'},uid),{'if-none-match':'*'})
  await assert.rejects(()=>putCalendarEventIdempotently({item,uid,href,trustedAction:true,request:server.request}),error=>error.status===409)
  assert.equal(server.writes,1)
})

test('Calendar update directly reads a fresh ETag when Apple omits it from the PUT response',async()=>{
  const item={sourceId:'assistant-one',actionId:'execute-proposal-one',title:'Updated dinner',date:'2026-09-08',time:'7:00 PM',allDay:false,pillar:'household',owner:'Larry',participants:[],notes:'',priority:false}
  const uid='apple-one',href='https://caldav.example/family/apple-one.ics'
  let body='',puts=0
  const headers=value=>({get:name=>name.toLowerCase()==='etag'?value:null})
  const request=async(url,method,next)=>{
    assert.equal(url,href)
    if(method==='PUT'){puts+=1;body=next;return{response:{url,headers:headers('')},text:''}}
    if(method==='GET')return{response:{url,headers:headers('etag-fresh')},text:body}
    throw new Error(`Unexpected ${method}`)
  }
  const result=await putCalendarUpdateWithFreshEtag({item,uid,href,reviewedEtag:'etag-old',request})
  assert.equal(puts,1)
  assert.equal(result.etag,'etag-fresh')
})

test('trusted Calendar deletion durably records reviewed intent before calling Apple',async()=>{
  const order=[]
  const item={actionId:'undo-journal-one-operation-one',sourceId:'assistant-one',href:'/family/apple-one.ics',etag:'etag-reviewed'}
  const current={...item,etag:'etag-reviewed'}
  const repository={saveCalendarMutationReceipt:async receipt=>{order.push(['intent',receipt]);return receipt}}
  const request=async(href,method,_body,headers)=>{order.push(['apple',href,method,headers]);return{response:{},text:''}}
  await deleteCalendarEventWithIntent({item,current,href:'https://caldav.example/family/apple-one.ics',repository,request,now:()=>new Date('2026-09-07T16:00:00.000Z')})
  assert.equal(order[0][0],'intent')
  assert.equal(order[0][1].reviewedEtag,'etag-reviewed')
  assert.equal(order[0][1].sourceId,'assistant-one')
  assert.deepEqual(order[1],['apple','https://caldav.example/family/apple-one.ics','DELETE',{'if-match':'etag-reviewed'}])
})

test('trusted Calendar deletion never calls Apple when durable intent cannot be saved',async()=>{
  let appleCalls=0
  const repository={saveCalendarMutationReceipt:async()=>{throw new Error('receipt storage unavailable')}}
  await assert.rejects(
    deleteCalendarEventWithIntent({
      item:{actionId:'execute-one',sourceId:'assistant-one',href:'/family/apple-one.ics',etag:'etag-reviewed'},
      current:{sourceId:'assistant-one',etag:'etag-reviewed'},
      href:'https://caldav.example/family/apple-one.ics',repository,
      request:async()=>{appleCalls+=1},
    }),
    /receipt storage unavailable/,
  )
  assert.equal(appleCalls,0)
})

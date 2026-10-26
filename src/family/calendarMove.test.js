import test from 'node:test'
import assert from 'node:assert/strict'
import {calendarPrivileges,connectedCalendarChoices,moveCalendarResource} from '../../netlify/lib/calendar-move.mjs'
import {prepareCalendarProposal,commitPreparedCalendarOperations,undoAudit} from '../../netlify/functions/brevity-assistant-actions.mjs'
import {canMoveAppleCalendarEvent} from './calendarRecords.js'
const family={id:`apple-${'a'.repeat(64)}`,url:'https://caldav.icloud.com/user/family/',name:'Family',canBind:true,canUnbind:true}
const personal={id:`apple-${'b'.repeat(64)}`,url:'https://caldav.icloud.com/user/personal/',name:'Personal',owner:'Larry',canBind:true,canUnbind:true}
const item={id:'event',uid:'event',href:'/user/family/event.ics',etag:'"1"',actionId:'move-1',appleCalendarId:family.id,calendarCanMove:true,source:'icloud',title:'Appointment'}
const raw='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:event\r\nDTSTART;TZID=America/New_York:20261026T090000\r\nRRULE:FREQ=WEEKLY\r\nATTENDEE:mailto:guest@example.com\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
function fixture(){
 let receipt=null;const records=new Map([[new URL(item.href,family.url).href,{text:raw,etag:item.etag}]]),calls=[]
 const repository={getCalendarMutationReceipt:async()=>receipt,saveCalendarMutationReceipt:async value=>(receipt||=value)}
 const request=async(url,method,body,headers)=>{calls.push({url,method,body,headers});const current=records.get(url);if(!current)throw Object.assign(Error('Missing'),{status:404});if(method==='MOVE'){assert.equal(headers['if-match'],current.etag);assert.equal(headers.overwrite,'F');if(records.has(headers.destination))throw Object.assign(Error('Destination exists'),{status:412});records.set(headers.destination,{...current,etag:'"2"'});records.delete(url);return{response:new Response(null,{status:201}),text:''}}return{text:current.text,response:new Response(null,{headers:{etag:current.etag}})}}
 return{records,calls,repository,request,input:{item,source:family,destination:personal,repository,request}}
}
test('calendar discovery requires explicit bind/unbind privileges and excludes unconnected calendars',()=>{
 assert.deepEqual(calendarPrivileges('<d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>'),{canBind:false,canUnbind:false})
 assert.deepEqual(calendarPrivileges('<d:current-user-privilege-set><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>'),{canBind:true,canUnbind:true})
 assert.deepEqual(connectedCalendarChoices({...family,sources:[family,personal]},[]).map(c=>c.id),[family.id])
 assert.equal(connectedCalendarChoices({...family,sources:[family,personal]},[personal])[1].owner,'Larry')
})
test('atomic move preserves exact ICS, reminders, attendees and recurrence; retry verifies destination without a second move',async()=>{
 const f=fixture(),result=await moveCalendarResource(f.input)
 assert.equal(result.text,raw);assert.equal(result.href,'/user/personal/event.ics');assert.equal(f.records.size,1)
 assert.deepEqual(await moveCalendarResource(f.input),result)
 assert.equal(f.calls.filter(c=>c.method==='MOVE').length,1)
})
test('move recovers a lost server response without copying or deleting the event',async()=>{
 const f=fixture();let lost=true
 const request=async(...args)=>{const response=await f.request(...args);if(args[1]==='MOVE'&&lost){lost=false;throw Error('Response lost')}return response}
 await assert.rejects(()=>moveCalendarResource({...f.input,request}),/Response lost/)
 assert.equal((await moveCalendarResource({...f.input,request})).text,raw)
 assert.equal(f.records.size,1)
})
test('move rejects newer source, occupied destination and unrelated paths without overwriting',async()=>{
 const f=fixture();await assert.rejects(()=>moveCalendarResource({...f.input,item:{...item,etag:'old'}}),/changed after review/)
 assert.equal(f.calls.filter(c=>c.method==='MOVE').length,0)
 f.records.set(new URL('event.ics',personal.url).href,{text:'unrelated',etag:'other'})
 await assert.rejects(()=>moveCalendarResource(f.input),e=>e.status===412)
 assert.equal(f.records.size,2)
 await assert.rejects(()=>moveCalendarResource({...f.input,item:{...item,href:'/user/other/event.ics'}}),/does not belong/)
})
test('move retry refuses destination content modified after the move',async()=>{
 const f=fixture();await moveCalendarResource(f.input)
 f.records.get(new URL('event.ics',personal.url).href).text='newer event'
 await assert.rejects(()=>moveCalendarResource(f.input),/could not be verified/)
})
test('calendar move review checks source version, destination and admin permissions',async()=>{
 const input={summary:'Move appointment',expectedEventToken:item.etag,operation:{type:'calendar.move',targetId:item.id,description:'Move appointment',payload:{calendarId:personal.id,calendarName:personal.name}}}
 const args={input,session:{member:'Larry',role:'admin'},permissions:{calendar:true},events:[item],destinations:[personal],repository:{saveProposal:async p=>p}}
 const proposal=await prepareCalendarProposal(args)
 assert.equal(proposal.operations[0].type,'calendar.move')
 await assert.rejects(()=>prepareCalendarProposal({...args,input:{...input,expectedEventToken:'old'}}),e=>e.code==='VERSION_CONFLICT')
 await assert.rejects(()=>prepareCalendarProposal({...args,session:{member:'Nyla',role:'member'}}),e=>e.code==='FORBIDDEN')
 await assert.rejects(()=>prepareCalendarProposal({...args,destinations:[]}),/writable connected/)
 await assert.rejects(()=>prepareCalendarProposal({...args,events:[{...item,id:'another-calendar/event'}]}),e=>e.code==='VERSION_CONFLICT')
 await assert.rejects(()=>prepareCalendarProposal({...args,events:[{...item,sourceReadOnly:true,originalSourceId:'project-example'}]}),e=>e.code==='FORBIDDEN')
 assert.equal(canMoveAppleCalendarEvent({...item,sourceReadOnly:true},{allowed:true,role:'admin'}),true)
 assert.equal(canMoveAppleCalendarEvent({...item,originalSourceId:'project-example'},{allowed:true,role:'admin'}),false)
})
test('move audit records the returned destination and Undo moves back using current version',async()=>{
 const moved={...item,id:'personal/event',href:'/user/personal/event.ics',etag:'"2"',appleCalendarId:personal.id}
 const prepared=[{resource:'calendar:apple-family',operationType:'calendar.move',before:item,after:{...item,_moveToCalendarId:personal.id}}],writes=[]
 const changes=await commitPreparedCalendarOperations({event:{},prepared,mutationId:'apply',calendarRequestFn:async(_,method,body)=>{if(method==='GET')return{events:[item]};writes.push(body);return moved}})
 assert.deepEqual(changes[0].after,moved);assert.equal(writes[0]._moveToCalendarId,personal.id)
 await undoAudit({event:{},audit:{actor:'Larry',undoAvailable:true,changes},session:{member:'Larry',role:'admin'},resources:{},mutationId:'undo',calendarRequestFn:async(_,method,body)=>{if(method==='GET')return{events:[moved,{...item,href:'/unrelated/event.ics',etag:'other'}]};writes.push(body);return item}})
 assert.equal(writes[1]._moveToCalendarId,family.id);assert.equal(writes[1].etag,moved.etag)
})

test('reviewed endpoint discovers writable destinations and performs a protected move with returned Apple metadata',async()=>{
 const {createICloudCalendarHandler}=await import('../../netlify/functions/icloud-calendar.mjs')
 const f=fixture(),mapping={id:personal.id,name:personal.name,owner:personal.owner}
 let role='admin',writable=true
 const handler=createICloudCalendarHandler({authenticate:async()=>({member:'Larry',role}),isTrustedAction:()=>true,calendarDiscovery:async()=>({...family,sources:[family,{...personal,canBind:writable}]}),sourceConfigReader:async()=>({value:[mapping],version:1}),eventLister:async source=>({events:source.url===family.url?[item]:[]}),actionRepositoryFactory:()=>({...f.repository,getPermissions:async()=>({Larry:{calendar:true}})}),calendarTransport:f.request})
 const response=await handler({httpMethod:'GET'}),payload=JSON.parse(response.body)
 assert.equal(response.statusCode,200);assert.equal(payload.destinations.length,2);assert.equal(payload.events[0].calendarCanMove,true)
 const request={httpMethod:'POST',body:JSON.stringify({...item,_moveToCalendarId:personal.id})}
 role='member';assert.equal((await handler(request)).statusCode,403)
 role='admin';writable=false;assert.equal((await handler(request)).statusCode,403)
 writable=true;const result=await handler(request)
 assert.equal(result.statusCode,200,result.body)
 const moved=JSON.parse(result.body);assert.equal(moved.appleCalendarId,personal.id);assert.equal(moved.owner,'Larry');assert.equal(moved.etag,'"2"');assert.equal(moved.alert1Minutes,15)
})

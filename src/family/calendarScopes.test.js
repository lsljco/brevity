import test from 'node:test'
import assert from 'node:assert/strict'
import {matchesCalendarScopes,toggleCalendarScope} from './calendarScopes.js'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {calendarAppointmentFromEvent} from './calendarOverlay.js'
test('member, combined, Family, church and All scopes use explicit ownership',()=>{
 const events=[{id:'l',owner:'Larry'},{id:'t',owner:'Terica'},{id:'p',owner:'Lorenzo',participants:['Larry']},{id:'f',owner:'Family'},{id:'c',owner:'Church Triumphant',participants:['Larry']},{id:'u',owner:'Family',ownershipKnown:false,title:'Larry church appointment'}]
 const visible=selection=>events.filter(event=>matchesCalendarScopes(event,selection)).map(event=>event.id)
 assert.deepEqual(visible(['Larry']),['l','p'])
 assert.deepEqual(visible(['Larry','Terica']),['l','t','p'])
 assert.deepEqual(visible(['Family']),['f'])
 assert.deepEqual(visible(['Church Triumphant']),['c'])
 assert.deepEqual(visible(['All']),['l','t','p','f','c','u'])
 assert.deepEqual(visible([]),[])
 assert.deepEqual(toggleCalendarScope(['Larry'],'Lorenzo'),['Larry','Lorenzo'])
 assert.deepEqual(toggleCalendarScope(['All'],'Larry'),['Larry'])
})
test('church calendar ownership is accepted only for calendar operations and respects write permissions',()=>{
 const action={type:'calendar.create',targetDate:'2026-10-01',description:'Create service',payload:{title:'Service',owner:'Church Triumphant'}}
 const proposal=normalizeActionProposal({operations:[action]},{member:'Larry',role:'admin'})
 assert.equal(proposal.operations[0].payload.owner,'Church Triumphant')
 assert.equal(permissionForOperation({operation:proposal.operations[0],member:'Terica',role:'member',permissions:{calendar:false}}).allowed,false)
 assert.throws(()=>normalizeActionProposal({operations:[{...action,type:'decision.create'}]},{member:'Larry',role:'admin'}),/owner/)
})
test('explicit Ministry pillar events retain their source owner and appear in the church calendar across screens',()=>{
 const event={id:'ministry-1',source:'project',owner:'Larry',pillar:'ministry',title:'Service',date:'2026-10-01'}
 const appointment=calendarAppointmentFromEvent(event)
 for(const record of [event,appointment]){
   assert.equal(record.owner,'Larry')
   assert.equal(matchesCalendarScopes(record,['Church Triumphant']),true)
   assert.equal(matchesCalendarScopes(record,['Family']),false)
   assert.equal(matchesCalendarScopes(record,['All']),true)
 }
 assert.equal(matchesCalendarScopes({...event,pillar:'household'},['Church Triumphant']),false)
})


test('Apple calendar filters follow mapped source rather than organizer or attendees',()=>{
 const family={id:'family',source:'icloud',appleCalendarId:'family-id',appleCalendarOwner:'Family',owner:'Larry',participants:['Nyla']}
 const terica={id:'terica',source:'icloud',appleCalendarId:'terica-id',appleCalendarOwner:'Terica',owner:'Terica',participants:['Nyla','Larry']}
 const nyla={id:'nyla',source:'icloud',appleCalendarId:'nyla-id',appleCalendarOwner:'Nyla',owner:'Nyla'}
 for(const transform of [event=>event,calendarAppointmentFromEvent]){
   const rows=[family,terica,nyla].map(transform)
   assert.deepEqual(rows.map(e=>matchesCalendarScopes(e,['Family'])),[true,false,false])
   assert.deepEqual(rows.map(e=>matchesCalendarScopes(e,['Terica'])),[false,true,false])
   assert.deepEqual(rows.map(e=>matchesCalendarScopes(e,['Nyla'])),[false,false,true])
   assert.equal(rows.every(e=>matchesCalendarScopes(e,['All'])),true)
 }
 assert.equal(matchesCalendarScopes({source:'icloud',owner:'Larry'},['Family']),true)
 assert.equal(matchesCalendarScopes({source:'icloud',owner:'Larry'},['Larry']),false)
 assert.equal(matchesCalendarScopes({source:'icloud',appleCalendarId:'old-cache',owner:'Terica'},['Terica']),true)
})

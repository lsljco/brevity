import test from 'node:test'
import assert from 'node:assert/strict'
import {matchesCalendarScopes,toggleCalendarScope} from './calendarScopes.js'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
test('member, combined, Family, church and All scopes use explicit ownership',()=>{
 const events=[{id:'l',owner:'Larry'},{id:'t',owner:'Terica'},{id:'p',owner:'Lorenzo',participants:['Larry']},{id:'f',owner:'Family'},{id:'c',owner:'Church Triumphant',participants:['Larry']},{id:'u',owner:'Family',ownershipKnown:false,title:'Larry church appointment'}]
 const visible=selection=>events.filter(event=>matchesCalendarScopes(event,selection)).map(event=>event.id)
 assert.deepEqual(visible(['Larry']),['l','p','f'])
 assert.deepEqual(visible(['Larry','Terica']),['l','t','p','f'])
 assert.deepEqual(visible(['Family']),['l','t','p','f','u'])
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

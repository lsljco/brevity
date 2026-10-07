import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAppleSources, mapAppleSourceEvent } from './appleCalendarSources.js'
import { appleCalendarId, createICloudCalendarHandler } from '../../netlify/functions/icloud-calendar.mjs'
import { dedupeCalendarEvents } from './calendarOverlay.js'
import { canEditBrevityCalendarEvent } from './calendarRecords.js'
import { matchesCalendarScopes } from './calendarScopes.js'
const primary={url:'https://caldav.icloud.com/family/',name:'Family'}
const personal={url:'https://caldav.icloud.com/personal/',name:'My appointments'}
const church={url:'https://caldav.icloud.com/church/',name:'Ministry'}
for(const source of [primary,personal,church])source.id=appleCalendarId(source.url)
const event={id:'same-uid',uid:'same-uid',title:'Appointment',date:'2026-10-01',owner:'Family',ownershipKnown:false,participants:[],etag:'v1',source:'icloud'}
const mapping=({id,name},owner)=>({id,name,owner})
const request={httpMethod:'GET',queryStringParameters:{}}
function handler({role='admin',selected=[],eventLister=async()=>({events:[event]})}={}) {
  return createICloudCalendarHandler({authenticate:async()=>({member:'Larry',role}),isTrustedAction:()=>false,calendarDiscovery:async()=>({...primary,sources:[primary,personal,church]}),sourceConfigReader:async()=>({value:selected,version:4}),eventLister})
}
test('only selected stable source IDs add events; equal provider UIDs remain separate',async()=>{
  const response=await handler({selected:[mapping(personal,'Larry'),mapping(church,'Church Triumphant')] })(request)
  assert.equal(response.statusCode,200)
  const body=JSON.parse(response.body)
  assert.equal(body.events.length,3)
  assert.deepEqual(body.events.map(row=>row.owner),['Family','Larry','Church Triumphant'])
  assert.equal(dedupeCalendarEvents(body.events).length,3)
  assert.equal(body.events[0].id,'same-uid')
  assert.equal(body.events[0].appleCalendarOwner,'Family')
  assert.equal(matchesCalendarScopes({...body.events[0],owner:'Larry'},['Family']),true)
  assert.equal(matchesCalendarScopes(body.events[1],['Family']),false)
  assert.equal(matchesCalendarScopes(body.events[1],['Larry']),true)
  assert.equal(matchesCalendarScopes(body.events[1],['Terica']),false)
  assert.equal(matchesCalendarScopes({...body.events[1],pillar:'ministry'},['Larry']),true)
  assert.equal(matchesCalendarScopes(body.events[2],['Family']),false)
  assert.equal(matchesCalendarScopes(body.events[2],['All']),true)
  assert.equal(canEditBrevityCalendarEvent(body.events[1],{allowed:true,role:'admin'}),false)
})
test('discovery is admin-only and returns no URLs or event contents',async()=>{
  const denied=await handler({role:'member'})({...request,queryStringParameters:{action:'sources'}})
  assert.equal(denied.statusCode,403)
  const response=JSON.parse((await handler()({...request,queryStringParameters:{action:'sources'}})).body)
  assert.equal(response.version,4)
  assert.equal(response.calendars[0].primary,true)
  assert.equal(JSON.stringify(response).includes('https:'),false)
  assert.equal(Object.hasOwn(response,'events'),false)
})
test('no selection reads only Family and any selected source failure fails the entire refresh',async()=>{
  const visited=[]
  const body=JSON.parse((await handler({eventLister:async source=>{visited.push(source.id);return {events:[event]}}})(request)).body)
  assert.equal(body.events.length,1)
  assert.deepEqual(visited,[primary.id])
  const missing=await handler({selected:[{id:`apple-${'a'.repeat(64)}`,name:'Missing',owner:'Larry'}]})(request)
  assert.notEqual(missing.statusCode,200)
  const failed=await handler({selected:[mapping(personal,'Larry')],eventLister:async source=>{if(source.id===personal.id)throw Error('Apple unavailable');return {events:[event]}}})(request)
  assert.notEqual(failed.statusCode,200)
})
test('mapping accepts explicit owners only, rejects duplicate IDs and isolates copied Brevity lineage',()=>{
  assert.throws(()=>normalizeAppleSources({sources:[mapping(personal,'Guess from title')]}))
  assert.throws(()=>normalizeAppleSources({sources:[mapping(personal,'Larry'),mapping(personal,'Terica')]}))
  assert.throws(()=>normalizeAppleSources({sources:[{...mapping(personal,'Larry'),url:'https://example.com'}]}))
  assert.equal(appleCalendarId(personal.url),appleCalendarId(personal.url.slice(0,-1)))
  const mapped=mapAppleSourceEvent({...event,sourceId:'assistant-shared'},mapping(personal,'Larry'))
  assert.equal(mapped.sourceId,'')
  assert.equal(mapped.originalSourceId,'assistant-shared')
})


test('a damaged source registry cannot masquerade as an empty fresh Family-only snapshot',async()=>{
  let reads=0
  const endpoint=createICloudCalendarHandler({authenticate:async()=>({member:'Larry',role:'admin'}),isTrustedAction:()=>false,calendarDiscovery:async()=>({...primary,sources:[primary]}),sourceConfigReader:async()=>({value:{damaged:true},version:2}),eventLister:async()=>{reads++;return {events:[]}}})
  assert.notEqual((await endpoint(request)).statusCode,200)
  assert.equal(reads,0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { PROJECT_STORAGE_KEY, normalizeProjectItem, parseProjectDate, projectCalendarEvent, projectDateKey, syncProjectCalendarEvents, writeJson } from './projectData.js'

function memoryStorage(){const data=new Map();return{getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value))}}

test('migrates the legacy single assignee into Responsible without losing it', () => {
  const item = normalizeProjectItem({ id: 'p1', assignee: 'Terica' })
  assert.deepEqual(item.raci.responsible, ['Terica'])
  assert.deepEqual(item.raci.accountable, [])
})

test('publishes one Family Calendar event with all RACI household members', () => {
  const event = projectCalendarEvent({
    id: 'p1', title: 'Contractor walkthrough', startDate: '2026-08-20', due: '2026-08-21',
    raci: { responsible: ['Larry', 'Terica'], accountable: ['Larry'], consulted: ['Lorenzo'], informed: [] },
  })
  assert.equal(event.calendarName, 'Family')
  assert.deepEqual(event.members, ['Larry', 'Terica', 'Lorenzo'])
  assert.equal(event.start, '2026-08-20')
  assert.equal(event.end, '2026-08-21')
})

test('defaults ownerless project events to Family and removes unpublished project events', () => {
  const items = [{ id: 'kept', title: 'Inspection', due: '2026-08-22', pushToFamilyCalendar: true }]
  const existing = [
    { id: 'project-old', source: 'project', projectId: 'old' },
    { id: 'family-note', source: 'planner', title: 'Family meeting' },
  ]
  const events = syncProjectCalendarEvents(items, existing)
  assert.equal(events.length, 2)
  assert.equal(events[1].owner, 'Family')
  assert.deepEqual(events[1].members, ['Family'])
  assert.equal(events.some(event => event.projectId === 'old'), false)
})

test('project dates remain local calendar dates instead of shifting through UTC', () => {
  const date = parseProjectDate('2026-08-21')
  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 7)
  assert.equal(date.getDate(), 21)
  assert.equal(projectDateKey(date), '2026-08-21')
})

test('HomeHQ writes prepare a versioned household-state record',()=>{
  const storage=memoryStorage(), items=[{id:'p1',title:'Paint kitchen'}]
  const result=writeJson(storage,PROJECT_STORAGE_KEY,items)
  assert.equal(result.ok,true)
  assert.equal(result.record.key,PROJECT_STORAGE_KEY)
  assert.equal(result.record.expectedVersion,0)
  assert.equal(storage.getItem(PROJECT_STORAGE_KEY),JSON.stringify(items))
})

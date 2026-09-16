import test from 'node:test'
import assert from 'node:assert/strict'
import { syncProjectEventsToICloud } from './projectIcloudSync.js'

test('project calendar sync creates, updates, and removes Apple events without duplicates', async () => {
  const calls = []
  const api = {
    fetch: async () => ({ events: [
      { id: 'cloud-1', sourceId: 'project-a', href: '/a.ics', etag: '1' },
      { id: 'cloud-old', sourceId: 'project-old', href: '/old.ics', etag: '1' },
    ] }),
    create: async event => calls.push(['create', event.sourceId]),
    update: async event => calls.push(['update', event.sourceId, event.href]),
    remove: async event => calls.push(['remove', event.sourceId]),
  }
  await syncProjectEventsToICloud([
    { id: 'a', title: 'Updated', due: '2026-08-22', pushToFamilyCalendar: true },
    { id: 'b', title: 'New', due: '2026-08-23', pushToFamilyCalendar: true },
  ], api)
  assert.deepEqual(calls, [['update', 'project-a', '/a.ics'], ['create', 'project-b'], ['remove', 'project-old']])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcilePlanWithICloud } from '../family/calendarSync.js'

const plan = {
  date: '2026-08-21',
  household: {
    appointments: [{
      id: 'school-meeting',
      title: 'Isaiah school meeting',
      date: '2026-08-21',
      startTime: '9:00 AM',
      owner: 'Larry',
      participants: ['Larry', 'Isaiah'],
      calendarSync: true,
    }],
  },
  ministry: { meetings: [] },
  assignments: [],
}

test('daily calendar sync targets scoped records and preserves unrelated Family events', async () => {
  const calls = []
  const api = {
    fetch: async () => ({ calendar: 'Family', events: [
      { id: 'apple-family-event', title: 'Family dinner', sourceId: '', href: '/family.ics' },
      { id: 'project-event', title: 'Project milestone', sourceId: 'project-kitchen', href: '/project.ics' },
      { id: 'another-day', title: 'Tomorrow', sourceId: 'daily-2026-08-22-task', href: '/tomorrow.ics' },
      { id: 'stale-today', title: 'Removed item', sourceId: 'daily-2026-08-21-removed', href: '/removed.ics' },
    ] }),
    create: async event => calls.push(['create', event.sourceId]),
    update: async event => calls.push(['update', event.sourceId]),
    remove: async event => calls.push(['remove', event.sourceId]),
  }

  await reconcilePlanWithICloud(plan, api)
  assert.deepEqual(calls, [
    ['create', 'daily-2026-08-21-school-meeting'],
    ['remove', 'daily-2026-08-21-removed'],
  ])
})

test('calendar sync sends owner and participant changes back to Apple', async () => {
  const calls = []
  const api = {
    fetch: async () => ({ calendar: 'Family', events: [{
      id: 'cloud-id',
      uid: 'cloud-uid',
      sourceId: 'daily-2026-08-21-school-meeting',
      title: 'Isaiah school meeting',
      date: '2026-08-21',
      time: '9:00 AM',
      allDay: false,
      pillar: 'household',
      owner: 'Family',
      participants: [],
      href: '/meeting.ics',
      etag: '1',
    }] }),
    create: async event => calls.push(['create', event]),
    update: async event => calls.push(['update', event.owner, event.participants, event.id]),
    remove: async event => calls.push(['remove', event]),
  }

  await reconcilePlanWithICloud(plan, api)
  assert.deepEqual(calls, [['update', 'Larry', ['Larry', 'Isaiah'], 'cloud-uid']])
})

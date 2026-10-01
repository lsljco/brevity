import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarSnapshotHealth, readCurrentCalendarSnapshot, setLiveCalendarSnapshot, stampCalendarFailure, stampCalendarSuccess } from './calendarSnapshot.js'

test('the live session snapshot takes priority over an older persistent cache', () => {
  const stored={events:[{id:'old'}],lastSuccessfulSyncAt:'2026-08-26T09:00:00.000Z'}
  const live={events:[{id:'new'}],lastSuccessfulSyncAt:'2026-08-26T10:00:00.000Z'}
  const storage={getItem:()=>JSON.stringify(stored)}
  setLiveCalendarSnapshot(live)
  assert.equal(readCurrentCalendarSnapshot(storage,null),live)
  setLiveCalendarSnapshot(null)
})

test('the temporary session cache is preferred when persistent storage is full', () => {
  const stored={events:[{id:'old'}]}
  const session={events:[{id:'session'}]}
  setLiveCalendarSnapshot(null)
  assert.deepEqual(
    readCurrentCalendarSnapshot({getItem:()=>JSON.stringify(stored)},{getItem:()=>JSON.stringify(session)}),
    session,
  )
})

test('successful calendar snapshots carry a verifiable synchronization time', () => {
  const snapshot = stampCalendarSuccess({ calendar: 'Family', events: [{ id: 'doctor' }] }, '2026-08-26T10:00:00.000Z')
  const health = calendarSnapshotHealth(snapshot, { now: new Date('2026-08-26T10:15:00.000Z') })

  assert.equal(snapshot.lastSuccessfulSyncAt, '2026-08-26T10:00:00.000Z')
  assert.equal(health.state, 'ready')
  assert.equal(health.usable, true)
  assert.equal(health.stale, false)
})

test('failed refresh preserves the last successful events but marks them stale', () => {
  const previous = stampCalendarSuccess({ events: [{ id: 'doctor' }] }, '2026-08-26T09:00:00.000Z')
  const failed = stampCalendarFailure(previous, { status: 400, message: 'Apple rejected discovery.' }, '2026-08-26T10:00:00.000Z')
  const health = calendarSnapshotHealth(failed, { now: new Date('2026-08-26T10:01:00.000Z') })

  assert.equal(failed.events.length, 1)
  assert.equal(failed.lastSuccessfulSyncAt, '2026-08-26T09:00:00.000Z')
  assert.equal(health.state, 'error')
  assert.equal(health.usable, true)
  assert.equal(health.stale, true)
})

test('legacy calendar caches are visible but never described as current', () => {
  const health = calendarSnapshotHealth({ events: [{ id: 'legacy' }] }, { now: new Date('2026-08-26T10:00:00.000Z') })

  assert.equal(health.state, 'stale')
  assert.equal(health.usable, true)
  assert.match(health.message, /freshness cannot be verified/i)
})

test('a recovered persistent cache wins over an older temporary session copy on reload',()=>{
  setLiveCalendarSnapshot(null)
  const old=stampCalendarSuccess({events:[{id:'old'}]},'2026-10-01T08:00:00Z')
  const current=stampCalendarSuccess({events:[{id:'current'}]},'2026-10-01T08:05:00Z')
  assert.equal(readCurrentCalendarSnapshot({getItem:()=>JSON.stringify(current)},{getItem:()=>JSON.stringify(old)}).events[0].id,'current')
})

test('calendar verification uses household time and future clocks cannot certify freshness',()=>{
  const snapshot=stampCalendarSuccess({events:[]},'2026-10-01T08:00:00Z')
  assert.match(calendarSnapshotHealth(snapshot,{now:new Date('2026-10-01T08:01:00Z')}).message,/4:00 AM/)
  assert.equal(calendarSnapshotHealth(snapshot,{now:new Date('2026-10-01T07:00:00Z')}).state,'stale')
})

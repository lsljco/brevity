import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarQueryReport, calendarQueryWindow, fetchCalendarReport } from '../../netlify/lib/icloud-calendar-report.mjs'

test('iCloud event queries use a bounded window instead of multi-year recurrence expansion', () => {
  const window = calendarQueryWindow(new Date('2026-08-26T12:00:00Z'))
  assert.deepEqual(window, { start:'20260428T000000Z', end:'20280227T235959Z' })
  const report = calendarQueryReport(window.start, window.end)
  assert.match(report, /<c:expand start="20260428T000000Z" end="20280227T235959Z"\/>/)
  assert.match(report, /<c:time-range start="20260428T000000Z" end="20280227T235959Z"\/>/)
})

test('iCloud falls back to a standard filtered REPORT when Apple rejects expansion with 400', async () => {
  const calls = []
  const result = await fetchCalendarReport({
    calendarUrl:'https://caldav.icloud.com/family/',
    now:new Date('2026-08-26T12:00:00Z'),
    request:async (...args) => {
      calls.push(args)
      if (calls.length === 1) throw Object.assign(new Error('rejected'), { status:400 })
      return { text:'<multistatus />' }
    },
  })

  assert.equal(calls.length, 2)
  assert.match(calls[0][2], /<c:expand/)
  assert.doesNotMatch(calls[1][2], /<c:expand/)
  assert.equal(result.recurrenceMode, 'server-filtered')
  assert.equal(result.text, '<multistatus />')
})

test('authentication and server failures are not hidden by the recurrence fallback', async () => {
  const error = Object.assign(new Error('unauthorized'), { status:401 })
  await assert.rejects(
    fetchCalendarReport({ calendarUrl:'https://caldav.icloud.com/family/', request:async () => { throw error } }),
    candidate => candidate === error,
  )
})

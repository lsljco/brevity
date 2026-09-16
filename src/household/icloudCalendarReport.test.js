import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarListPropfind, calendarQueryReport, calendarQueryWindow, fetchCalendarList, fetchCalendarReport, firstDavPropertyHref, resolveAppleDavHref } from '../../netlify/lib/icloud-calendar-report.mjs'

test('iCloud discovery reads the href nested in the requested DAV property', () => {
  const xml = `<?xml version="1.0"?>
    <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <d:response>
        <d:href>/</d:href>
        <d:propstat><d:prop>
          <d:current-user-principal><d:href>/123456/principal/</d:href></d:current-user-principal>
          <c:calendar-home-set><d:href>/123456/calendars/</d:href></c:calendar-home-set>
        </d:prop></d:propstat>
      </d:response>
    </d:multistatus>`

  assert.equal(firstDavPropertyHref(xml, 'current-user-principal'), '/123456/principal/')
  assert.equal(firstDavPropertyHref(xml, 'calendar-home-set'), '/123456/calendars/')
  assert.equal(firstDavPropertyHref(xml, 'missing-property'), '')
})

test('iCloud discovery resolves relative DAV hrefs against the server that returned them', () => {
  assert.equal(
    resolveAppleDavHref('/123456/calendars/', 'https://p123-caldav.icloud.com/123456/principal/'),
    'https://p123-caldav.icloud.com/123456/calendars/',
  )
  assert.equal(
    resolveAppleDavHref('https://p123-caldav.icloud.com/123456/calendars/family/', 'https://caldav.icloud.com/'),
    'https://p123-caldav.icloud.com/123456/calendars/family/',
  )
})

test('iCloud discovery never forwards credentials to a non-Apple DAV host', () => {
  assert.throws(
    () => resolveAppleDavHref('https://calendar.example.com/steal/', 'https://caldav.icloud.com/'),
    /invalid CalDAV resource URL/,
  )
  assert.throws(
    () => resolveAppleDavHref('http://caldav.icloud.com/insecure/', 'https://caldav.icloud.com/'),
    /invalid CalDAV resource URL/,
  )
})

test('iCloud calendar discovery falls back to a minimal property request after 400', async () => {
  const calls = []
  const result = await fetchCalendarList({
    homeUrl:'https://caldav.icloud.com/home/',
    request:async (...args) => {
      calls.push(args)
      if (calls.length === 1) throw Object.assign(new Error('rejected'), { status:400 })
      return { text:'<multistatus />' }
    },
  })

  assert.equal(calls.length, 2)
  assert.match(calls[0][2], /supported-calendar-component-set/)
  assert.doesNotMatch(calls[1][2], /supported-calendar-component-set/)
  assert.match(calls[1][2], /displayname/)
  assert.match(calls[1][2], /resourcetype/)
  assert.equal(result.discoveryMode, 'minimal')
})

test('minimal calendar discovery remains valid CalDAV XML', () => {
  const request = calendarListPropfind({ includeComponents:false })
  assert.match(request, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(request, /xmlns:c="urn:ietf:params:xml:ns:caldav"/)
  assert.doesNotMatch(request, /supported-calendar-component-set/)
})

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

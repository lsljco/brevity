const DAY_MS = 24 * 60 * 60 * 1000

const decodeXmlText = value => String(value || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export function firstDavPropertyHref(xml, propertyName) {
  const property = String(xml).match(new RegExp(`<(?:\\w+:)?${propertyName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${propertyName}>`, 'i'))
  if (!property) return ''
  const href = property[1].match(/<(?:\w+:)?href\b[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/i)
  return href ? decodeXmlText(href[1].replace(/<[^>]+>/g, '').trim()) : ''
}

export function resolveAppleDavHref(href, requestUrl) {
  if (!href) throw new Error('Apple returned an empty CalDAV resource URL.')
  const resolved = new URL(href, requestUrl)
  const appleHost = resolved.hostname === 'icloud.com' || resolved.hostname.endsWith('.icloud.com')
  if (resolved.protocol !== 'https:' || !appleHost) {
    throw new Error('Apple returned an invalid CalDAV resource URL.')
  }
  return resolved.href
}

const utcStamp = (date, endOfDay = false) => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, '0'),
  String(date.getUTCDate()).padStart(2, '0'),
  endOfDay ? 'T235959Z' : 'T000000Z',
].join('')

export function calendarQueryWindow(now = new Date(), { pastDays = 120, futureDays = 550 } = {}) {
  const anchor = new Date(now)
  const startDate = new Date(anchor.getTime() - pastDays * DAY_MS)
  const endDate = new Date(anchor.getTime() + futureDays * DAY_MS)
  return { start:utcStamp(startDate), end:utcStamp(endDate, true) }
}

export function calendarQueryReport(start, end, { expand = true } = {}) {
  const calendarData = expand
    ? `<c:calendar-data><c:expand start="${start}" end="${end}"/></c:calendar-data>`
    : '<c:calendar-data/>'
  return `<?xml version="1.0" encoding="UTF-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/>${calendarData}</d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${start}" end="${end}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
}

export function calendarListPropfind({ includeComponents = true } = {}) {
  const componentProperty = includeComponents ? '<c:supported-calendar-component-set/>' : ''
  return `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/>${componentProperty}</d:prop></d:propfind>`
}

export async function fetchCalendarList({ homeUrl, request }) {
  try {
    const result = await request(homeUrl, 'PROPFIND', calendarListPropfind(), { depth:'1' }, 'calendar-list discovery request')
    return { ...result, discoveryMode:'capabilities' }
  } catch (error) {
    if (error?.status !== 400) throw error
    const result = await request(homeUrl, 'PROPFIND', calendarListPropfind({ includeComponents:false }), { depth:'1' }, 'minimal calendar-list discovery request')
    return { ...result, discoveryMode:'minimal' }
  }
}

export async function fetchCalendarReport({ calendarUrl, request, now = new Date() }) {
  const { start, end } = calendarQueryWindow(now)
  try {
    const result = await request(calendarUrl, 'REPORT', calendarQueryReport(start, end), { depth:'1' }, 'expanded calendar event query')
    return { ...result, recurrenceMode:'expanded', start, end }
  } catch (error) {
    if (error?.status !== 400) throw error
    const result = await request(calendarUrl, 'REPORT', calendarQueryReport(start, end, { expand:false }), { depth:'1' }, 'standard calendar event query')
    return { ...result, recurrenceMode:'server-filtered', start, end }
  }
}

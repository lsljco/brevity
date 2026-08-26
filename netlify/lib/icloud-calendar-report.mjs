const DAY_MS = 24 * 60 * 60 * 1000

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

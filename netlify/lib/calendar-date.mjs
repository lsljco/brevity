// Calendar-only dates must never shift with the browser or server timezone.
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
export function weekdayForDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return ''
  const date=new Date(value+'T12:00:00Z')
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return ''
  return days[date.getUTCDay()]
}
export function alignSermonDate(sermon) {
  const weekday=weekdayForDate(sermon.date)
  const label=String(sermon.serviceType||'').trim()
  return {...sermon,serviceType:weekday&&(!label||days.some(day=>day.toLowerCase()===label.toLowerCase()))?weekday:label}
}
export function sermonDateError(sermon) {
  if(sermon.date&&!weekdayForDate(sermon.date))return 'Enter a valid sermon date.'
  const weekday=weekdayForDate(sermon.date)
  const label=String(sermon.serviceType||'').trim()
  if(weekday&&days.some(day=>day.toLowerCase()===label.toLowerCase())&&weekday.toLowerCase()!==label.toLowerCase())
    return sermon.date+' is '+weekday+', not '+label+'. Review the sermon date.'
  return ''
}

import { HOUSEHOLD_MEMBERS } from '../household/dailyPlan.js'
export const CHURCH_CALENDAR = 'Church Triumphant'
export const CALENDAR_SCOPES = ['All','Family',...HOUSEHOLD_MEMBERS,CHURCH_CALENDAR]
// Ownership and explicit participant IDs only. Titles and descriptions never
// determine which member or ministry an event belongs to.
export function matchesCalendarScopes(event, selected) {
  if (selected.includes('All')) return true
  const church = event?.owner === CHURCH_CALENDAR || event?.calendarScope === 'church-triumphant'
  if (church) return selected.includes(CHURCH_CALENDAR)
  if (selected.includes('Family')) return true
  const participants = [...(event?.participants || []),...(event?.members || [])]
  return selected.some(member => HOUSEHOLD_MEMBERS.includes(member) && (event?.owner === member || participants.includes(member) || (event?.owner === 'Family' && event?.ownershipKnown !== false)))
}
export function toggleCalendarScope(selected, scope) {
  if (scope === 'All' || scope === 'Family') return selected.length === 1 && selected[0] === scope ? [] : [scope]
  const specific = selected.filter(value => value !== 'All' && value !== 'Family')
  return specific.includes(scope) ? specific.filter(value => value !== scope) : [...specific,scope]
}

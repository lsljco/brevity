import { HOUSEHOLD_MEMBERS } from '../household/dailyPlan.js'
export const CHURCH_CALENDAR = 'Church Triumphant'
export const CALENDAR_SCOPES = ['All','Family',...HOUSEHOLD_MEMBERS,CHURCH_CALENDAR]
// Apple source membership is independent of an event's organizer/participants.
// Never infer calendar membership from its title or display name.
export function matchesCalendarScopes(event, selected) {
  if (selected.includes('All')) return true
  const apple = event?.source === 'icloud' || event?.calendarSource === 'icloud' || Boolean(event?.appleCalendarId)
  if (apple) {
    const owner = event.appleCalendarOwner || (event.appleCalendarId ? event.owner : 'Family')
    return selected.includes(owner)
  }
  const church = event?.owner === CHURCH_CALENDAR || event?.calendarScope === 'church-triumphant' || event?.pillar === 'ministry'
  if (church) return selected.includes(CHURCH_CALENDAR)
  if (event?.owner === 'Family') return selected.includes('Family') && event?.ownershipKnown !== false
  const participants = [...(event?.participants || []),...(event?.members || [])]
  return selected.some(member => HOUSEHOLD_MEMBERS.includes(member) && (event?.owner === member || participants.includes(member)))
}
export function toggleCalendarScope(selected, scope) {
  if (scope === 'All' || scope === 'Family') return selected.length === 1 && selected[0] === scope ? [] : [scope]
  const specific = selected.filter(value => value !== 'All' && value !== 'Family')
  return specific.includes(scope) ? specific.filter(value => value !== scope) : [...specific,scope]
}

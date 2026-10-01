import { CALENDAR_SCOPES, toggleCalendarScope } from './calendarScopes.js'
export default function CalendarScopeFilter({selected,onChange}) {
  return <div className="calendar-scope-filter" role="group" aria-label="Calendars to show">{CALENDAR_SCOPES.map(scope=><button type="button" key={scope} aria-pressed={selected.includes(scope)} onClick={()=>onChange(toggleCalendarScope(selected,scope))}>{scope}</button>)}</div>
}

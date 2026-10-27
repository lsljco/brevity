import { FAMILY_CALENDAR_KEY, readJson } from '../homehq/projectData.js'
import { isLegacyMeetingCalendarCopy, meetingActionsCalendarEvents } from '../finance/meetingCalendar.js'
import { HOUSEHOLD_SCHEDULE_STORAGE_KEY, householdScheduleCalendarEvents, isHouseholdScheduleCalendarCopy, normalizeHouseholdScheduleState } from '../household/householdScheduleData.js'
import { HOUSEHOLD_MAINTENANCE_STORAGE_KEY, isHouseholdOperationCalendarCopy, normalizeHouseholdMaintenanceState } from '../household/householdMaintenanceData.js'
import { canonicalizeBrevityCalendarEvent, isBrevityManagedAppleEvent } from './calendarRecords.js'
import { dedupeCalendarEvents, calendarEventsForDate, compareCalendarEventsChronologically } from './calendarOverlay.js'
import { matchesCalendarScopes } from './calendarScopes.js'
export const normalizeLegacy = event => {
  const normalized=canonicalizeBrevityCalendarEvent(event)
  return { ...normalized,date:normalized.date||normalized.start,source:normalized.source||'brevity-legacy',owner:normalized.owner||'Family' }
}
export const readLegacyEvents=()=>readJson(localStorage,FAMILY_CALENDAR_KEY,[]).filter(event=>!isLegacyMeetingCalendarCopy(event)&&!isHouseholdScheduleCalendarCopy(event)&&!isHouseholdOperationCalendarCopy(event)).map(normalizeLegacy)
export const readMeetingEvents=()=>meetingActionsCalendarEvents(localStorage).map(normalizeLegacy)
export const readScheduleState=()=>normalizeHouseholdScheduleState(readJson(localStorage,HOUSEHOLD_SCHEDULE_STORAGE_KEY,{}))
export const readMaintenanceState=()=>normalizeHouseholdMaintenanceState(readJson(localStorage,HOUSEHOLD_MAINTENANCE_STORAGE_KEY,{}))
export const normalizeIcloud = event => {
  const owned=isBrevityManagedAppleEvent({ ...event,source:'icloud' })
  const normalized=owned?canonicalizeBrevityCalendarEvent({ ...event,source:'brevity-owned',calendarSource:'brevity' }):event
  return { ...normalized,source:'icloud',owner:normalized.owner||'Family' }
}

export function combineCalendarRecords({legacyEvents=[],meetingEvents=[],householdDerivedEvents=[],icloudEvents=[],projectEvents=[]}) {
 const cloudSources=new Set(icloudEvents.map(event=>event.sourceId).filter(Boolean))
 return dedupeCalendarEvents([...legacyEvents.filter(event=>event.source!=='project'&&!String(event.sourceId||'').startsWith('project-')&&!cloudSources.has(event.id)),...meetingEvents,...householdDerivedEvents,...icloudEvents.filter(event=>!String(event.sourceId||'').startsWith('project-')),...projectEvents])
}
export function familyCalendarDay(events,date) {
 return calendarEventsForDate(events,date).filter(event=>matchesCalendarScopes(event,['Family'])).sort(compareCalendarEventsChronologically)
}
export function readLocalCalendarRecords(date) {
 return {legacyEvents:readLegacyEvents(),meetingEvents:readMeetingEvents(),householdDerivedEvents:householdScheduleCalendarEvents({...readScheduleState(),routines:[]},{start:date,days:1}).map(normalizeLegacy)}
}

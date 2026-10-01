import { HOUSEHOLD_MEMBERS } from '../homehq/projectData.js'

export const APPLE_SOURCES_RESOURCE = 'shared:brevity_apple_calendar_sources_v1'
export const APPLE_SOURCE_OWNERS = [...HOUSEHOLD_MEMBERS, 'Family', 'Church Triumphant']

export function normalizeAppleSources(payload) {
  if (!payload || Object.keys(payload).some(key => key !== 'sources') || !Array.isArray(payload.sources) || payload.sources.length > 20) throw new Error('Choose up to twenty additional Apple calendars.')
  const ids = new Set()
  return { sources: payload.sources.map(source => {
    if (!source || Object.keys(source).some(key => !['id','name','owner'].includes(key))) throw new Error('Calendar mappings contain unsupported fields.')
    if (!/^apple-[a-f0-9]{64}$/.test(source.id || '') || ids.has(source.id)) throw new Error('Each calendar needs a unique discovered Apple calendar ID.')
    if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 200) throw new Error('A calendar mapping needs its display name.')
    if (!APPLE_SOURCE_OWNERS.includes(source.owner)) throw new Error('Choose a household member, Family, or Church Triumphant.')
    ids.add(source.id)
    return { id:source.id, name:source.name.trim(), owner:source.owner }
  }) }
}

export function mapAppleSourceEvent(event, source) {
  // A collection ID is authoritative. Similar titles, dates and provider UIDs
  // in different collections never merge independently imported events.
  return {
    ...event,
    id:`${source.id}/${event.id}`,
    sourceId:'',
    originalSourceId:event.sourceId || '',
    appleCalendarId:source.id,
    appleCalendarName:source.name,
    sourceReadOnly:true,
    owner:source.owner,
    ownershipKnown:true,
    calendarScope:source.owner === 'Church Triumphant' ? 'church-triumphant' : undefined,
    ...(source.owner === 'Church Triumphant' ? { pillar:'ministry' } : {}),
  }
}

import { createICloudCalendarEvent, deleteICloudCalendarEvent, fetchICloudCalendarEvents, updateICloudCalendarEvent } from '../family/icloudCalendarApi.js'
import { projectCalendarEvent } from './projectData.js'

export async function syncProjectEventsToICloud(items = [], api = {}) {
  const client = {
    fetch: api.fetch || fetchICloudCalendarEvents,
    create: api.create || createICloudCalendarEvent,
    update: api.update || updateICloudCalendarEvent,
    remove: api.remove || deleteICloudCalendarEvent,
  }
  const desired = items.filter(item => item.pushToFamilyCalendar).map(projectCalendarEvent).filter(Boolean)
  const cloud = await client.fetch()
  const existing = new Map((cloud.events || []).filter(event => String(event.sourceId || '').startsWith('project-')).map(event => [event.sourceId, event]))
  const desiredIds = new Set(desired.map(event => event.sourceId))

  const results = []
  for (const event of desired) {
    const prior = existing.get(event.sourceId)
    results.push(prior
      ? await client.update({ ...event, id: prior.id, href: prior.href, etag: prior.etag })
      : await client.create(event))
  }
  for (const [sourceId, event] of existing) {
    if (!desiredIds.has(sourceId)) results.push(await client.remove(event))
  }
  return { ok: true, count: results.length }
}

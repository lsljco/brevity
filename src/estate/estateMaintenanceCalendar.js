import { createICloudCalendarEvent, fetchICloudCalendarEvents, updateICloudCalendarEvent } from '../family/icloudCalendarApi.js'
import { maintenanceCalendarEvent } from './estateMaintenance.js'

export async function syncEstateMaintenanceToFamilyCalendar(input, api = {}) {
  const client = {
    fetch: api.fetch || fetchICloudCalendarEvents,
    create: api.create || createICloudCalendarEvent,
    update: api.update || updateICloudCalendarEvent,
  }
  const desired = maintenanceCalendarEvent(input)
  if (!desired) throw new Error('This maintenance event is not eligible for Family Calendar publishing.')
  const cloud = await client.fetch()
  const prior = (cloud.events || []).find(event => event.sourceId === desired.sourceId)
  const result = prior
    ? await client.update({ ...desired, id: prior.id, href: prior.href, etag: prior.etag })
    : await client.create(desired)
  return { ...result, sourceId: desired.sourceId, id: result.id || prior?.id, href: result.href || prior?.href, etag: result.etag || prior?.etag || '' }
}

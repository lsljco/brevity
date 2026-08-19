import {
  createICloudCalendarEvent,
  deleteICloudCalendarEvent,
  fetchICloudCalendarEvents,
  isCalendarEligible,
  planItemToCalendarEvent,
  updateICloudCalendarEvent,
} from './icloudCalendarApi.js'

function planCalendarItems(plan) {
  const sources = [
    ['household', plan.household?.appointments || []],
    ['ministry', plan.ministry?.meetings || []],
    ['household', plan.assignments || []],
  ]

  return sources.flatMap(([pillar, items]) => items
    .filter(item => isCalendarEligible(item))
    .map(item => ({ item, pillar })))
}

function sameEvent(a, b) {
  return a.title === b.title &&
    a.date === b.date &&
    (a.time || '') === (b.time || '') &&
    Boolean(a.allDay) === Boolean(b.allDay) &&
    (a.pillar || 'household') === (b.pillar || 'household') &&
    Boolean(a.priority) === Boolean(b.priority)
}

export async function reconcilePlanWithICloud(plan) {
  const remote = await fetchICloudCalendarEvents()
  const existing = remote.events || []
  const existingBySource = new Map(existing.filter(event => event.sourceId).map(event => [event.sourceId, event]))
  const desired = planCalendarItems(plan)
  const desiredSourceIds = new Set(desired.map(({ item }) => item.id))
  const summary = { calendar: remote.calendar || 'iCloud Calendar', created: 0, updated: 0, deleted: 0, unchanged: 0 }

  for (const { item, pillar } of desired) {
    const candidate = planItemToCalendarEvent(item, plan.date, pillar)
    const current = existingBySource.get(item.id)
    if (!current) {
      await createICloudCalendarEvent(candidate)
      summary.created += 1
      continue
    }

    if (sameEvent(candidate, current)) {
      summary.unchanged += 1
      continue
    }

    await updateICloudCalendarEvent({ ...candidate, id: current.id, href: current.href, etag: current.etag })
    summary.updated += 1
  }

  for (const event of existing) {
    if (!event.sourceId || desiredSourceIds.has(event.sourceId)) continue
    await deleteICloudCalendarEvent(event)
    summary.deleted += 1
  }

  return summary
}

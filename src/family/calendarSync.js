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
  const participants = value => [...(value || [])].sort().join('|')
  return a.title === b.title &&
    a.date === b.date &&
    (a.time || '') === (b.time || '') &&
    Boolean(a.allDay) === Boolean(b.allDay) &&
    (a.pillar || 'household') === (b.pillar || 'household') &&
    (a.owner || 'Family') === (b.owner || 'Family') &&
    participants(a.participants) === participants(b.participants) &&
    Boolean(a.priority) === Boolean(b.priority)
}

export async function reconcilePlanWithICloud(plan, api = {}) {
  const client = {
    fetch: api.fetch || fetchICloudCalendarEvents,
    create: api.create || createICloudCalendarEvent,
    update: api.update || updateICloudCalendarEvent,
    remove: api.remove || deleteICloudCalendarEvent,
  }
  const remote = await client.fetch()
  const existing = remote.events || []
  const existingBySource = new Map(existing.filter(event => event.sourceId).map(event => [event.sourceId, event]))
  const desired = planCalendarItems(plan)
  const sourcePrefix = `daily-${plan.date}-`
  const desiredSourceIds = new Set(desired.map(({ item }) => `${sourcePrefix}${item.id}`))
  const summary = { calendar: remote.calendar || 'iCloud Calendar', created: 0, updated: 0, deleted: 0, unchanged: 0 }

  for (const { item, pillar } of desired) {
    const candidate = planItemToCalendarEvent(item, plan.date, pillar, `${sourcePrefix}${item.id}`)
    // Match the legacy unscoped ID once so existing events are upgraded without
    // duplication. New records are always scoped to their daily plan.
    const current = existingBySource.get(candidate.sourceId) || existingBySource.get(item.id)
    if (!current) {
      await client.create(candidate)
      summary.created += 1
      continue
    }

    if (sameEvent(candidate, current)) {
      summary.unchanged += 1
      continue
    }

    await client.update({ ...candidate, id: current.uid || current.id, href: current.href, etag: current.etag })
    summary.updated += 1
  }

  for (const event of existing) {
    // Saving one day must never delete unrelated Apple events, project events,
    // or Brevity events belonging to another day.
    if (!event.sourceId?.startsWith(sourcePrefix) || desiredSourceIds.has(event.sourceId)) continue
    await client.remove(event)
    summary.deleted += 1
  }

  return summary
}

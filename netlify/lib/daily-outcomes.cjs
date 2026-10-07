// Outcomes are standing direction: the latest explicit dated list applies until
// another alignment replaces it. Read resolution never creates daily records.
const items = plan => Array.isArray(plan?.household?.priorities) && plan.household.priorities.length
  ? plan.household.priorities : Array.isArray(plan?.topPriorities) ? plan.topPriorities : []
const explicit = plan => Boolean(plan?.outcomesReviewed || (!plan?.outcomesInheritedFrom && items(plan).length))
async function resolveDailyOutcomes(store, householdId, date, current) {
  const apply = (source, sourceDate) => {
    const outcomes = structuredClone(items(source))
    return { ...(current || { id:`daily-plan-${date}`, date, version:0 }),
      topPriorities: outcomes, household: { ...(current?.household || {}), priorities:structuredClone(outcomes) },
      ...(sourceDate === date ? {} : { outcomesInheritedFrom:sourceDate }) }
  }
  if (explicit(current)) return apply(current, date)
  // Legacy test adapters may not provide listing. Production stores always do.
  if (typeof store.list !== 'function') return current
  const prefix = `${householdId}/daily-plans/`
  const keys = []
  for await (const page of store.list({ prefix, paginate:true })) {
    for (const blob of page.blobs || []) {
      const keyDate = blob.key.slice(prefix.length)
      if (/^\d{4}-\d{2}-\d{2}$/.test(keyDate) && keyDate < date) keys.push(blob.key)
    }
  }
  for (const key of keys.sort().reverse()) {
    const entry = await store.getWithMetadata(key, { type:'json' })
    if (explicit(entry?.data)) return apply(entry.data, key.slice(prefix.length))
  }
  return current
}
module.exports = { resolveDailyOutcomes }

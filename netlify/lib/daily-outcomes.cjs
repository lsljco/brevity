// Outcomes are standing direction: the latest explicit dated list applies until
// another alignment replaces it. Read resolution never creates daily records.
// Match the client read model: canonical rows win, but legacy writers may
// have saved additional outcomes in the household list. Never discard those.
const items = plan => {
  const rows = [...(Array.isArray(plan?.topPriorities) ? plan.topPriorities : [])]
  const normalize = row => typeof row === 'string' ? { title:row, owner:'Family' } : row || {}
  const same = (left, right) => {
    const a = normalize(left), b = normalize(right)
    return (a.id && b.id && a.id === b.id) ||
      (String(a.title || '').trim() === String(b.title || '').trim() &&
       (a.owner || 'Family') === (b.owner || 'Family') &&
       (a.date || plan.date) === (b.date || plan.date))
  }
  for (const row of Array.isArray(plan?.household?.priorities) ? plan.household.priorities : []) {
    if (!rows.some(existing => same(existing, row))) rows.push(row)
  }
  return rows
}
const explicit = plan => Boolean(plan?.outcomesReviewed || (!plan?.outcomesInheritedFrom && items(plan).length))
async function resolveDailyOutcomes(store, householdId, date, current) {
  const apply = (source, sourceDate) => {
    const outcomes = structuredClone(items(source)).map(item => typeof item === 'object' && item && item.date === sourceDate && sourceDate !== date ? { ...item, date } : item)
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

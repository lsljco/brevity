export const PILLAR_ANALYSIS_SCHEMA_VERSION = 8

const FRESHNESS_ONLY_KEYS = new Set([
  'cachedAt',
  'checkedAt',
  'fetchedAt',
  'generatedAt',
  'lastCheckedAt',
  'lastRefreshedAt',
  'lastSyncedAt',
  'refreshedAt',
  'syncedAt',
  'updatedAt',
])

function stableValue(value) {
  // Array order can carry authored meaning (Scripture sequence, ranked
  // priorities, formation steps). Set-like operational feeds are sorted by
  // their collectors before they reach the signature; do not erase order here.
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined && !FRESHNESS_ONLY_KEYS.has(key))
      .map(key => [key, stableValue(value[key])]))
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return value
}

function hashText(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function pillarAnalysisContextSignature({ pillarData = {}, localContext = {} } = {}) {
  const serialized = JSON.stringify(stableValue({ pillarData, localContext }))
  return `context-${hashText(serialized)}-${serialized.length}`
}

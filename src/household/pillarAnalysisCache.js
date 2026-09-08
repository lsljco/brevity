export const PILLAR_ANALYSIS_SCHEMA_VERSION = 9

const memberSegment = member => String(member || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'unknown'
const PILLAR_IDS = ['spiritual', 'health', 'fitness', 'household', 'education', 'finance', 'ministry']

export const pillarAnalysisStorageKey = (date, pillar, member) => `brevity_pillar_analysis_v${PILLAR_ANALYSIS_SCHEMA_VERSION}_${date}_${pillar}_${memberSegment(member)}`

export function clearPillarAnalyses(date, storage = globalThis.localStorage, member = '') {
  if (!storage || !date) return
  if (member) {
    PILLAR_IDS.forEach(pillar => storage.removeItem(pillarAnalysisStorageKey(date, pillar, member)))
    return
  }
  const prefix = `brevity_pillar_analysis_v${PILLAR_ANALYSIS_SCHEMA_VERSION}_${date}_`
  const keys = []
  for (let index = 0; index < (storage.length || 0); index += 1) {
    const key = storage.key?.(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  keys.forEach(key => storage.removeItem(key))
}

const FRESHNESS_ONLY_KEYS = new Set([
  'cachedAt',
  'checkedAt',
  'fetchedAt',
  'generatedAt',
  'lastCheckedAt',
  'lastRefreshedAt',
  'lastSuccessfulSyncAt',
  'lastSyncedAt',
  'refreshedAt',
  'syncedAt',
  'updatedAt',
])

function stableValue(value, path = []) {
  // Array order can carry authored meaning (Scripture sequence, ranked
  // priorities, formation steps). Set-like operational feeds are sorted by
  // their collectors before they reach the signature; do not erase order here.
  if (Array.isArray(value)) return value.map((item,index) => stableValue(item,[...path,String(index)]))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined && !FRESHNESS_ONLY_KEYS.has(key) && !(path.at(-1)==='appleCalendarCoverage'&&key==='message'))
      .map(key => [key, stableValue(value[key],[...path,key])]))
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

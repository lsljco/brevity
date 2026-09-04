export const SHARED_STATE_EVENT = 'brevity-shared-state-updated'
export const SHARED_STATE_SYNC_ERROR_EVENT = 'brevity-shared-state-sync-error'
export const SHARED_STATE_KEYS = [
  'lslj_finance_v9', 'lslj_budget_v1', 'lslj_actuals_v1', 'lslj_bal_overrides_v1',
  'lslj_tx_overrides_v1', 'lslj_tx_rules_v1', 'brevity_finance_categories_v1', 'brevity_finance_scenarios_v1',
  'fp_goals', 'homehq_items_v1', 'family_calendar_events_v1', 'brevity_daily_financial_alignment_v1', 'brevity_finance_timeframe_v1',
  'brevity_finance_meetings_v1', 'brevity_household_maintenance_v1', 'brevity_household_inventory_v1', 'brevity_household_finance_bridge_v1',
  'brevity_household_schedule_v1',
]

const ENDPOINT = '/.netlify/functions/household-state'
const META_KEY = 'brevity_shared_state_meta_v1'
const REQUEST_TIMEOUT_MS = 20000
const SHARED_STATE_KEY_SET = new Set(SHARED_STATE_KEYS)

export function hashValue(value = '') {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function readMeta(storage) {
  try { return JSON.parse(storage.getItem(META_KEY) || '{}') }
  catch { return {} }
}

function writeMeta(storage, meta) {
  storage.setItem(META_KEY, JSON.stringify(meta))
}

async function request(method, body) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(ENDPOINT, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.error || `Household synchronization failed (${response.status}).`)
      error.status = response.status
      throw error
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Household synchronization timed out. Local changes remain on this device.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function dispatchRemoteChange(keys) {
  if (keys.length && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHARED_STATE_EVENT, { detail: { keys } }))
  }
}

function dispatchSyncError(error, key) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHARED_STATE_SYNC_ERROR_EVENT, { detail: { key, error } }))
  }
}

export function buildSharedRecord(storage, key, serializedValue, now = new Date().toISOString()) {
  if (!SHARED_STATE_KEY_SET.has(key)) return null
  const meta = readMeta(storage)
  const record = { key, value: serializedValue, hash: hashValue(serializedValue), updatedAt: now }
  meta[key] = { hash: record.hash, updatedAt: record.updatedAt }
  writeMeta(storage, meta)
  return record
}

function applyServerRecord(storage, record) {
  if (!record?.key || !SHARED_STATE_KEY_SET.has(record.key) || typeof record.value !== 'string') return false
  const localValue = storage.getItem(record.key)
  if (localValue === record.value) return false
  if (localValue != null) {
    try { storage.setItem(`${record.key}_local_backup_before_cloud`, localValue) } catch {}
  }
  storage.setItem(record.key, record.value)
  const meta = readMeta(storage)
  meta[record.key] = { hash: record.hash || hashValue(record.value), updatedAt: record.updatedAt || new Date().toISOString() }
  writeMeta(storage, meta)
  dispatchRemoteChange([record.key])
  return true
}

export function writeSharedJson(storage, key, value, now = new Date().toISOString()) {
  const serialized = JSON.stringify(value)
  storage.setItem(key, serialized)
  try { storage.setItem(`${key}_backup`, serialized) } catch {}
  const record = buildSharedRecord(storage, key, serialized, now)
  if (record && typeof window !== 'undefined') {
    request('PUT', record)
      .then(result => {
        if (result?.conflict && result.record) applyServerRecord(storage, result.record)
      })
      .catch(error => dispatchSyncError(error, key))
  }
  return { ok: true, record }
}

export function reconcileSharedRecords(storage, remoteRecords = {}, now = new Date().toISOString()) {
  const meta = readMeta(storage)
  const uploads = []
  const applied = []
  SHARED_STATE_KEYS.forEach(key => {
    const localValue = storage.getItem(key)
    const localHash = localValue == null ? '' : hashValue(localValue)
    const prior = meta[key]
    const remote = remoteRecords[key]
    const localChanged = Boolean(prior && prior.hash !== localHash)
    if (remote && (!prior || (!localChanged && remote.updatedAt > (prior.updatedAt || '')))) {
      if (localValue != null && localValue !== remote.value) {
        try { storage.setItem(`${key}_local_backup_before_cloud`, localValue) } catch {}
      }
      storage.setItem(key, remote.value)
      meta[key] = { hash: remote.hash || hashValue(remote.value), updatedAt: remote.updatedAt }
      if (localValue !== remote.value) applied.push(key)
      return
    }
    if (localValue == null) return
    const updatedAt = localChanged || !prior ? now : prior.updatedAt
    meta[key] = { hash: localHash, updatedAt }
    if (!remote || remote.hash !== localHash || remote.updatedAt < updatedAt) uploads.push({ key, value: localValue, hash: localHash, updatedAt })
  })
  writeMeta(storage, meta)
  return { uploads, applied, meta }
}

export async function syncSharedState(storage = window.localStorage) {
  const remote = await request('GET')
  const result = reconcileSharedRecords(storage, remote.records || {})
  const responses = await Promise.allSettled(result.uploads.map(record => request('PUT', record)))
  const rejected = responses.filter(item => item.status === 'rejected')
  dispatchRemoteChange(result.applied)
  return { ...result, rejected }
}

export function startSharedStateSync({ storage = window.localStorage, intervalMs = 10000, onRemoteChange, onError } = {}) {
  let stopped = false
  let running = false
  const run = async () => {
    if (running || stopped) return
    running = true
    try {
      const result = await syncSharedState(storage)
      if (result.applied.length) onRemoteChange?.(result.applied)
      if (result.rejected.length) onError?.(result.rejected[0].reason)
    } catch (error) {
      onError?.(error)
    } finally {
      running = false
    }
  }
  const timer = setInterval(run, intervalMs)
  const visibility = () => { if (document.visibilityState === 'hidden') run() }
  document.addEventListener('visibilitychange', visibility)
  return () => {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', visibility)
  }
}

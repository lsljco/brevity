export const SHARED_STATE_EVENT = 'brevity-shared-state-updated'
export const SHARED_STATE_SYNC_ERROR_EVENT = 'brevity-shared-state-sync-error'
export const SHARED_STATE_HEALTH_EVENT = 'brevity-shared-state-health'
export const SHARED_STATE_KEYS = [
  'lslj_finance_v9', 'lslj_budget_v1', 'lslj_actuals_v1', 'lslj_bal_overrides_v1',
  'lslj_tx_overrides_v1', 'lslj_tx_rules_v1', 'brevity_finance_categories_v1', 'brevity_finance_scenarios_v1',
  'fp_goals', 'homehq_items_v1', 'family_calendar_events_v1', 'brevity_daily_financial_alignment_v1', 'brevity_finance_timeframe_v1',
  'brevity_finance_meetings_v1', 'brevity_household_maintenance_v1', 'brevity_household_inventory_v1', 'brevity_household_finance_bridge_v1',
  'brevity_household_schedule_v1',
]

const ENDPOINT = '/.netlify/functions/household-state'
const META_KEY = 'brevity_shared_state_meta_v1'
const HEALTH_KEY = 'brevity_shared_state_health_v1'
const REQUEST_TIMEOUT_MS = 20000
const SHARED_STATE_KEY_SET = new Set(SHARED_STATE_KEYS)
let suppressWriteThrough = false
let pendingWrites = 0

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
function writeMeta(storage, meta) { storage.setItem(META_KEY, JSON.stringify(meta)) }

export function getSharedStateHealth(storage = window.localStorage) {
  try {
    return {
      status:'unknown', pendingWrites:0, lastSuccessAt:'', lastErrorAt:'', lastError:'', lastConflictAt:'', lastConflictKey:'',
      ...JSON.parse(storage.getItem(HEALTH_KEY) || '{}'),
    }
  } catch {
    return { status:'unknown', pendingWrites:0, lastSuccessAt:'', lastErrorAt:'', lastError:'', lastConflictAt:'', lastConflictKey:'' }
  }
}

function updateHealth(storage, patch) {
  const next = { ...getSharedStateHealth(storage), ...patch, pendingWrites }
  try { storage.setItem(HEALTH_KEY, JSON.stringify(next)) } catch {}
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SHARED_STATE_HEALTH_EVENT, { detail:next }))
  return next
}

async function request(method, body) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(ENDPOINT, {
      method,
      credentials:'include',
      headers:{ 'content-type':'application/json' },
      body:body ? JSON.stringify(body) : undefined,
      signal:controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.error || `Household synchronization failed (${response.status}).`)
      error.status = response.status
      throw error
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Household synchronization timed out. Your local cache is preserved and Brevity will retry automatically.')
    throw error
  } finally { clearTimeout(timeout) }
}

function dispatchRemoteChange(keys) {
  if (keys.length && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SHARED_STATE_EVENT, { detail:{ keys } }))
}
function dispatchSyncError(error, key) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SHARED_STATE_SYNC_ERROR_EVENT, { detail:{ key, error } }))
}

export function buildSharedRecord(storage, key, serializedValue, now = new Date().toISOString()) {
  if (!SHARED_STATE_KEY_SET.has(key)) return null
  const meta = readMeta(storage)
  const prior = meta[key] || {}
  return {
    key,
    value:serializedValue,
    hash:hashValue(serializedValue),
    updatedAt:now,
    expectedVersion:Math.max(0, Number(prior.version || 0)),
  }
}

function applyServerRecord(storage, record) {
  if (!record?.key || !SHARED_STATE_KEY_SET.has(record.key) || typeof record.value !== 'string') return false
  const localValue = storage.getItem(record.key)
  if (localValue != null && localValue !== record.value) {
    try { storage.setItem(`${record.key}_local_backup_before_cloud`, localValue) } catch {}
  }
  suppressWriteThrough = true
  try { storage.setItem(record.key, record.value) } finally { suppressWriteThrough = false }
  const meta = readMeta(storage)
  meta[record.key] = {
    hash:record.hash || hashValue(record.value),
    updatedAt:record.updatedAt || new Date().toISOString(),
    version:Math.max(0, Number(record.version || 0)),
  }
  writeMeta(storage, meta)
  if (localValue !== record.value) dispatchRemoteChange([record.key])
  return localValue !== record.value
}

function acknowledgeServerRecord(storage, record) {
  if (!record?.key) return
  const meta = readMeta(storage)
  meta[record.key] = {
    hash:record.hash || hashValue(record.value || ''),
    updatedAt:record.updatedAt || new Date().toISOString(),
    version:Math.max(0, Number(record.version || 0)),
  }
  writeMeta(storage, meta)
}

function uploadRecord(storage, record, onError) {
  pendingWrites += 1
  updateHealth(storage, { status:'syncing' })
  return request('PUT', record)
    .then(result => {
      if (result?.conflict && result.record) {
        applyServerRecord(storage, result.record)
        updateHealth(storage, {
          status:'healthy',
          lastSuccessAt:new Date().toISOString(),
          lastConflictAt:new Date().toISOString(),
          lastConflictKey:record.key,
          lastError:'',
        })
      } else if (result?.record) {
        acknowledgeServerRecord(storage, result.record)
        updateHealth(storage, { status:'healthy', lastSuccessAt:new Date().toISOString(), lastError:'' })
      }
      return result
    })
    .catch(error => {
      updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message || 'Household synchronization failed.' })
      dispatchSyncError(error, record.key)
      onError?.(error)
      return null
    })
    .finally(() => {
      pendingWrites = Math.max(0, pendingWrites - 1)
      const health = getSharedStateHealth(storage)
      updateHealth(storage, { status:health.lastError && !health.lastSuccessAt ? 'degraded' : pendingWrites ? 'syncing' : health.status === 'degraded' ? 'degraded' : 'healthy' })
    })
}

export function writeSharedJson(storage, key, value, now = new Date().toISOString()) {
  const serialized = JSON.stringify(value)
  const previous = storage.getItem(key)
  if (previous === serialized) return { ok:true, record:null, unchanged:true }
  suppressWriteThrough = true
  try {
    storage.setItem(key, serialized)
    try { storage.setItem(`${key}_backup`, serialized) } catch {}
  } finally { suppressWriteThrough = false }
  const record = buildSharedRecord(storage, key, serialized, now)
  if (record && typeof window !== 'undefined') void uploadRecord(storage, record)
  return { ok:true, record, unchanged:false }
}

export function reconcileSharedRecords(storage, remoteRecords = {}, now = new Date().toISOString()) {
  const meta = readMeta(storage)
  const uploads = []
  const applied = []
  suppressWriteThrough = true
  try {
    SHARED_STATE_KEYS.forEach(key => {
      const localValue = storage.getItem(key)
      const localHash = localValue == null ? '' : hashValue(localValue)
      const prior = meta[key]
      const remote = remoteRecords[key]
      const remoteVersion = Math.max(0, Number(remote?.version || 0))
      const localChanged = Boolean(prior && prior.hash !== localHash)

      if (remote && (!prior || (!localChanged && (remoteVersion > Math.max(0, Number(prior.version || 0)) || remote.updatedAt > (prior.updatedAt || ''))))) {
        if (localValue != null && localValue !== remote.value) {
          try { storage.setItem(`${key}_local_backup_before_cloud`, localValue) } catch {}
        }
        storage.setItem(key, remote.value)
        meta[key] = { hash:remote.hash || hashValue(remote.value), updatedAt:remote.updatedAt, version:remoteVersion }
        if (localValue !== remote.value) applied.push(key)
        return
      }

      if (localValue == null) return
      const updatedAt = localChanged || !prior ? now : prior.updatedAt
      const expectedVersion = Math.max(0, Number(prior?.version || 0))
      meta[key] = { hash:localHash, updatedAt, version:expectedVersion }
      if (!remote || remote.hash !== localHash || remote.updatedAt < updatedAt) uploads.push({ key, value:localValue, hash:localHash, updatedAt, expectedVersion })
    })
    writeMeta(storage, meta)
  } finally { suppressWriteThrough = false }
  return { uploads, applied, meta }
}

export async function syncSharedState(storage = window.localStorage) {
  updateHealth(storage, { status:'syncing' })
  try {
    const remote = await request('GET')
    const result = reconcileSharedRecords(storage, remote.records || {})
    const responses = await Promise.allSettled(result.uploads.map(record => uploadRecord(storage, record)))
    const rejected = responses.filter(item => item.status === 'rejected')
    dispatchRemoteChange(result.applied)
    updateHealth(storage, { status:pendingWrites ? 'syncing' : 'healthy', lastSuccessAt:new Date().toISOString(), lastError:'' })
    return { ...result, rejected }
  } catch (error) {
    updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message || 'Household synchronization failed.' })
    throw error
  }
}

export function installSharedStateWriteThrough({ storage = window.localStorage, onError } = {}) {
  if (typeof Storage === 'undefined' || !(storage instanceof Storage)) return () => {}
  const prototype = Storage.prototype
  const original = prototype.setItem
  prototype.setItem = function setItem(key, value) {
    original.call(this, key, value)
    if (this !== storage || suppressWriteThrough || !SHARED_STATE_KEY_SET.has(String(key))) return
    const record = buildSharedRecord(storage, String(key), String(value))
    if (record) void uploadRecord(storage, record, onError)
  }
  return () => { if (prototype.setItem !== original) prototype.setItem = original }
}

export function startSharedStateSync({ storage = window.localStorage, intervalMs = 10000, onRemoteChange, onError } = {}) {
  let stopped = false
  let running = false
  const stopWriteThrough = installSharedStateWriteThrough({ storage, onError })
  const run = async () => {
    if (running || stopped) return
    running = true
    try {
      const result = await syncSharedState(storage)
      if (result.applied.length) onRemoteChange?.(result.applied)
      if (result.rejected.length) onError?.(result.rejected[0].reason)
    } catch (error) { onError?.(error) }
    finally { running = false }
  }
  const timer = setInterval(run, intervalMs)
  const visibility = () => { if (document.visibilityState === 'visible') void run() }
  const focus = () => { if (document.visibilityState !== 'hidden') void run() }
  const online = () => void run()
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('focus', focus)
  window.addEventListener('online', online)
  return () => {
    stopped = true
    stopWriteThrough()
    clearInterval(timer)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('focus', focus)
    window.removeEventListener('online', online)
  }
}

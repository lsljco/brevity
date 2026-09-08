export const SHARED_STATE_EVENT = 'brevity-shared-state-updated'
export const SHARED_STATE_SYNC_ERROR_EVENT = 'brevity-shared-state-sync-error'
export const SHARED_STATE_HEALTH_EVENT = 'brevity-shared-state-health'
export const SHARED_STATE_KEYS = [
  'lslj_finance_v9', 'plaid_actuals_cache', 'lslj_budget_v1', 'lslj_actuals_v1',
  'lslj_tx_overrides_v1', 'lslj_tx_rules_v1', 'brevity_finance_scenarios_v1',
  'fp_goals', 'homehq_items_v1', 'family_calendar_events_v1', 'brevity_daily_financial_alignment_v1',
  'brevity_finance_meetings_v1', 'brevity_household_maintenance_v1', 'brevity_household_inventory_v1', 'brevity_household_finance_bridge_v1',
  'brevity_household_schedule_v1',
]

const ENDPOINT = '/.netlify/functions/household-state'
const META_KEY = 'brevity_shared_state_meta_v1'
const HEALTH_KEY = 'brevity_shared_state_health_v1'
const REQUEST_TIMEOUT_MS = 20000
const SHARED_STATE_KEY_SET = new Set(SHARED_STATE_KEYS)
const PLAID_SOURCE_KEY_SET = new Set(['lslj_finance_v9', 'plaid_actuals_cache'])
let suppressWriteThrough = false
let pendingWrites = 0
const uploadChains = new WeakMap()

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
export function getSharedStateVersion(storage, key) {
  return Math.max(0, Number(readMeta(storage)?.[String(key)]?.version || 0))
}

function unavailableSharedVersion(message, cause) {
  const error = new Error(message)
  error.status = 409
  error.code = 'SHARED_STATE_VERSION_UNAVAILABLE'
  if (cause) error.cause = cause
  return error
}

/**
 * Return a version that is known to describe the exact local record. Direct
 * Action preparation must not treat an unacknowledged or locally modified
 * record as a version-zero create, because doing so could fold unreviewed
 * local state into the proposed replacement.
 */
export function getAcknowledgedSharedStateVersion(storage, key) {
  const normalizedKey = String(key || '')
  if (!SHARED_STATE_KEY_SET.has(normalizedKey)) {
    throw unavailableSharedVersion('This household record is not enabled for synchronized changes.')
  }

  let localValue
  let rawMeta
  try {
    localValue = storage.getItem(normalizedKey)
    rawMeta = storage.getItem(META_KEY)
  } catch (cause) {
    throw unavailableSharedVersion('The synchronized version could not be verified because browser storage is unavailable.', cause)
  }

  let meta = {}
  if (rawMeta) {
    try { meta = JSON.parse(rawMeta) }
    catch (cause) {
      throw unavailableSharedVersion('The synchronized version metadata is damaged. Refresh household data before preparing this change.', cause)
    }
  }
  const acknowledged = meta?.[normalizedKey]

  // A genuinely absent local record may propose an atomic version-zero create.
  // If metadata says a server record exists but its local value is unavailable,
  // fail closed and let synchronization restore the record first.
  if (localValue == null) {
    if (!acknowledged) return 0
    throw unavailableSharedVersion('The synchronized household record is not available locally. Refresh household data before preparing this change.')
  }

  const version = Number(acknowledged?.version)
  if (!Number.isInteger(version) || version <= 0 || acknowledged?.hash !== hashValue(localValue)) {
    throw unavailableSharedVersion('This household record has local changes that are not durably synchronized. Wait for household sync, then try again.')
  }
  return version
}

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
      if (payload.code) error.code = payload.code
      if (payload.record) error.record = payload.record
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

export function shouldUploadSharedWrite() {
  // Generic browser writes are never eligible for server upload. Only the
  // explicit, server-validated Plaid source-ingestion path can write here.
  return false
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

function uploadRecordNow(storage, record, onError, { applyAcknowledgement = true } = {}) {
  pendingWrites += 1
  updateHealth(storage, { status:'syncing' })
  return request('PUT', { ...record, writeMode:'source-ingestion', source:'plaid' })
    .then(result => {
      if (result?.conflict && result.record) {
        // Do not let the response to an older in-flight write erase a newer
        // local edit. Keep that edit local and require an explicit refresh or
        // conflict decision instead of silently rebasing it onto the server.
        if (applyAcknowledgement && storage.getItem(record.key) === record.value) applyServerRecord(storage, result.record)
        else if (applyAcknowledgement) {
          try { storage.setItem(`${record.key}_server_conflict`, JSON.stringify(result.record)) } catch {}
        }
        updateHealth(storage, {
          status:'healthy',
          lastSuccessAt:new Date().toISOString(),
          lastConflictAt:new Date().toISOString(),
          lastConflictKey:record.key,
          lastError:'',
        })
      } else if (result?.record) {
        if (applyAcknowledgement) acknowledgeServerRecord(storage, result.record)
        updateHealth(storage, result.sourceAcknowledgementPending
          ? { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:result.error || 'The source cursor acknowledgement is pending.' }
          : { status:'healthy', lastSuccessAt:new Date().toISOString(), lastError:'' })
      }
      return result
    })
    .catch(error => {
      updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message || 'Household synchronization failed.' })
      dispatchSyncError(error, record.key)
      onError?.(error)
      throw error
    })
    .finally(() => {
      pendingWrites = Math.max(0, pendingWrites - 1)
      const health = getSharedStateHealth(storage)
      updateHealth(storage, { status:health.lastError && !health.lastSuccessAt ? 'degraded' : pendingWrites ? 'syncing' : health.status === 'degraded' ? 'degraded' : 'healthy' })
    })
}

// Serialize writes per record key. Before a queued write starts, rebuild it
// from the newest local value and newly acknowledged version. This prevents
// two rapid edits from both claiming the same expectedVersion and having the
// later local edit overwritten by the first conflict response.
function serializedUpload(storage, key, task) {
  let chains = uploadChains.get(storage)
  if (!chains) {
    chains = new Map()
    uploadChains.set(storage, chains)
  }
  const prior = chains.get(key) || Promise.resolve()
  const queued = prior.catch(() => {}).then(task)
  chains.set(key, queued)
  void queued.finally(() => {
    if (chains.get(key) === queued) chains.delete(key)
  }).catch(() => {})
  return queued
}

export function writeSharedJson(storage, key, value, now = new Date().toISOString()) {
  const serialized = JSON.stringify(value)
  const previous = storage.getItem(key)
  if (previous === serialized) return { ok:true, record:null, unchanged:true, upload:null }
  if (SHARED_STATE_KEY_SET.has(String(key))) {
    const error = new Error('This household record requires reviewed Action Mode so the change is audited and can be safely undone.')
    error.status = 403
    error.code = 'ACTION_REVIEW_REQUIRED'
    dispatchSyncError(error, String(key))
    return { ok:false, error, record:null, unchanged:false, upload:null, requiresReview:true }
  }
  suppressWriteThrough = true
  try {
    storage.setItem(key, serialized)
    try { storage.setItem(`${key}_backup`, serialized) } catch {}
  } finally { suppressWriteThrough = false }
  return { ok:true, record:null, unchanged:false, upload:null, localOnly:true, updatedAt:now }
}

function sourceImportConflict(result) {
  const error = new Error(result?.error || 'Household data changed on another device. The newer synchronized record was kept; refresh the source before trying again.')
  error.status = 409
  error.code = 'VERSION_CONFLICT'
  error.record = result?.record || null
  return error
}

/**
 * Persist an authoritative external-source snapshot only after its server-side
 * compare-and-swap succeeds. Unlike ordinary UI write-through, this path does
 * not place unacknowledged bank/import data in the local cache first.
 */
export async function persistSharedSourceImport(storage, key, value, nowOrOptions = new Date().toISOString(), legacyOnError) {
  const normalizedKey = String(key || '')
  if (!PLAID_SOURCE_KEY_SET.has(normalizedKey)) throw new Error('Only Plaid-managed finance source records can use source ingestion.')
  const options = nowOrOptions && typeof nowOrOptions === 'object' && !Array.isArray(nowOrOptions)
    ? nowOrOptions
    : { now:nowOrOptions, onError:legacyOnError }
  const now = typeof options.now === 'string' && options.now ? options.now : new Date().toISOString()
  const onError = typeof options.onError === 'function' ? options.onError : undefined
  const sourceReceipts = options.sourceReceipts
  const accountSourceReceipt = options.accountSourceReceipt
  if (normalizedKey === 'plaid_actuals_cache' && (!Array.isArray(sourceReceipts) || !sourceReceipts.length)) {
    const error = new Error('A verified Plaid transaction source receipt is required before transaction history can be updated.')
    error.code = 'SOURCE_RECEIPT_REQUIRED'
    dispatchSyncError(error, normalizedKey)
    throw error
  }
  if (normalizedKey !== 'plaid_actuals_cache' && sourceReceipts !== undefined) {
    const error = new Error('Transaction source receipts cannot be used for this source record.')
    error.code = 'INVALID_SOURCE_INGESTION'
    dispatchSyncError(error, normalizedKey)
    throw error
  }
  if (normalizedKey === 'lslj_finance_v9' && (!accountSourceReceipt?.payload || !accountSourceReceipt?.signature)) {
    const error = new Error('A server-verified Plaid account source receipt is required before account balances can be updated.')
    error.code = 'SOURCE_RECEIPT_REQUIRED'
    dispatchSyncError(error, normalizedKey)
    throw error
  }
  if (normalizedKey === 'plaid_actuals_cache' && accountSourceReceipt !== undefined) {
    const error = new Error('Account source receipts cannot be used for transaction history.')
    error.code = 'INVALID_SOURCE_INGESTION'
    dispatchSyncError(error, normalizedKey)
    throw error
  }

  let serialized
  try {
    serialized = JSON.stringify(value)
    if (typeof serialized !== 'string') throw new Error('The source snapshot could not be serialized.')
    // Fail before contacting the server when browser storage is unavailable.
    storage.getItem(normalizedKey)
  } catch (error) {
    dispatchSyncError(error, normalizedKey)
    throw error
  }

  // Capture the reviewed version before entering the per-key queue. Rebuilding
  // it after another write completes would silently rebase an older source
  // snapshot onto newer household data instead of reporting a conflict.
  const localValueBeforeUpload = storage.getItem(normalizedKey)
  const record = buildSharedRecord(storage, normalizedKey, serialized, now)
  if (!record) throw new Error('This source record is not enabled for household synchronization.')
  if (normalizedKey === 'plaid_actuals_cache') record.sourceReceipts = sourceReceipts
  if (normalizedKey === 'lslj_finance_v9') record.accountSourceReceipt = accountSourceReceipt
  return serializedUpload(storage, normalizedKey, async () => {
    const result = await uploadRecordNow(storage, record, onError, { applyAcknowledgement:false })
    const localValueAfterUpload = storage.getItem(normalizedKey)
    const locallySuperseded = localValueAfterUpload !== localValueBeforeUpload && localValueAfterUpload !== serialized

    if (result?.conflict) {
      // The server record is newer than the version used for this source read.
      // Apply that newer record locally, but never call the import successful.
      if (result.record?.key === normalizedKey) {
        try {
          if (locallySuperseded) acknowledgeServerRecord(storage, result.record)
          else applyServerRecord(storage, result.record)
        }
        catch (error) {
          updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message || 'The newer household record could not be cached locally.' })
          dispatchSyncError(error, normalizedKey)
          onError?.(error)
          throw error
        }
      }
      throw sourceImportConflict(result)
    }
    const acknowledgedVersion = Number(result?.record?.version)
    const acknowledgedExpectedVersion = acknowledgedVersion === record.expectedVersion || acknowledgedVersion === record.expectedVersion + 1
    if (result?.record?.key !== normalizedKey || result.record.value !== serialized || result.record.hash !== record.hash || !Number.isInteger(acknowledgedVersion) || !acknowledgedExpectedVersion) {
      const error = new Error('The source snapshot was not durably acknowledged. The prior local cache was kept.')
      error.code = 'SOURCE_IMPORT_NOT_ACKNOWLEDGED'
      updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message })
      dispatchSyncError(error, normalizedKey)
      onError?.(error)
      throw error
    }
    if (locallySuperseded) {
      // The source snapshot did reach the server, so advance only the
      // acknowledged version/hash. Keep the newer local value intact; the
      // already queued local write will now compare against this version.
      acknowledgeServerRecord(storage, result.record)
      const error = new Error('A newer local change arrived while bank data was being saved. Brevity kept that change and did not present the source refresh as complete.')
      error.status = 409
      error.code = 'SOURCE_IMPORT_SUPERSEDED'
      updateHealth(storage, {
        status:'healthy',
        lastConflictAt:new Date().toISOString(),
        lastConflictKey:normalizedKey,
        lastError:'',
      })
      dispatchSyncError(error, normalizedKey)
      onError?.(error)
      throw error
    }

    try {
      applyServerRecord(storage, result.record)
      try { storage.setItem(`${normalizedKey}_backup`, serialized) } catch {}
    } catch (error) {
      updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message || 'The acknowledged source snapshot could not be cached locally.' })
      dispatchSyncError(error, normalizedKey)
      onError?.(error)
      throw error
    }
    if (result.sourceAcknowledgementPending) {
      const error = new Error(result.error || 'The transaction snapshot was saved, but its bank cursor acknowledgement is pending. The next safe refresh will replay it.')
      error.status = 503
      error.code = 'SOURCE_RECEIPT_ACK_PENDING'
      updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message })
      dispatchSyncError(error, normalizedKey)
      onError?.(error)
      throw error
    }
    return { ok:true, durable:true, record:result.record }
  })
}

export function reconcileSharedRecords(storage, remoteRecords = {}, _now = new Date().toISOString()) {
  const meta = readMeta(storage)
  const uploads = []
  const applied = []
  const blockedLocal = []
  suppressWriteThrough = true
  try {
    SHARED_STATE_KEYS.forEach(key => {
      const localValue = storage.getItem(key)
      const remote = remoteRecords[key]
      const remoteVersion = Math.max(0, Number(remote?.version || 0))

      // The server is the only authoritative store for user-managed shared
      // records. Never upload or rebase a browser-only value discovered during
      // synchronization; preserve a backup and apply the reviewed server copy.
      if (remote && typeof remote.value === 'string') {
        if (localValue != null && localValue !== remote.value) {
          try { storage.setItem(`${key}_local_backup_before_cloud`, localValue) } catch {}
        }
        storage.setItem(key, remote.value)
        meta[key] = { hash:remote.hash || hashValue(remote.value), updatedAt:remote.updatedAt, version:remoteVersion }
        if (localValue !== remote.value) applied.push(key)
        return
      }

      if (localValue == null) return
      // A local record with no server counterpart is not acknowledged truth.
      // Preserve it under an explicit recovery key, then remove it from the
      // live key. Otherwise every refresh re-reports the same browser-only
      // value and feature readers can mistake it for synchronized truth.
      try { storage.setItem(`${key}_local_backup_before_cloud`, localValue) } catch {}
      try { storage.removeItem(key) } catch {}
      delete meta[key]
      blockedLocal.push(key)
    })
    writeMeta(storage, meta)
  } finally { suppressWriteThrough = false }
  return { uploads, applied, blockedLocal, meta }
}

export async function syncSharedState(storage = window.localStorage, onError) {
  updateHealth(storage, { status:'syncing' })
  try {
    const remote = await request('GET')
    const result = reconcileSharedRecords(storage, remote.records || {})
    dispatchRemoteChange(result.applied)
    const rejected = []
    if (result.blockedLocal.length) {
      const error = new Error(`${result.blockedLocal.length} browser-only household record${result.blockedLocal.length === 1 ? ' was' : 's were'} moved out of live views and preserved in the recovery cache. Synchronized household data remains authoritative.`)
      error.status = 409
      error.code = 'UNACKNOWLEDGED_LOCAL_STATE'
      error.keys = result.blockedLocal
      rejected.push({ status:'rejected', reason:error })
      dispatchSyncError(error, result.blockedLocal[0])
      onError?.(error)
      const message = error.message
      updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:message })
    } else {
      updateHealth(storage, { status:pendingWrites ? 'syncing' : 'healthy', lastSuccessAt:new Date().toISOString(), lastError:'' })
    }
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
    const normalizedKey = String(key)
    if (this !== storage || suppressWriteThrough || !SHARED_STATE_KEY_SET.has(normalizedKey)) {
      return original.call(this, key, value)
    }
    if (storage.getItem(normalizedKey) === String(value)) return undefined
    const error = new Error('This household record requires reviewed Action Mode so the change is audited and can be safely undone.')
    error.status = 403
    error.code = 'ACTION_REVIEW_REQUIRED'
    updateHealth(storage, { status:'degraded', lastErrorAt:new Date().toISOString(), lastError:error.message })
    dispatchSyncError(error, normalizedKey)
    onError?.(error)
    return undefined
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
      const result = await syncSharedState(storage, onError)
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

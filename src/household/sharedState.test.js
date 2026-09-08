import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SHARED_STATE_KEYS,
  buildSharedRecord,
  getAcknowledgedSharedStateVersion,
  getSharedStateHealth,
  hashValue,
  installSharedStateWriteThrough,
  persistSharedSourceImport,
  reconcileSharedRecords,
  shouldUploadSharedWrite,
  syncSharedState,
  writeSharedJson,
} from './sharedState.js'

function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values))
  return {
    getItem:key => data.has(String(key)) ? data.get(String(key)) : null,
    setItem:(key, value) => data.set(String(key), String(value)),
    removeItem:key => data.delete(String(key)),
    dump:() => Object.fromEntries(data),
  }
}

function installBrowserGlobals(dispatchEvent = () => {}) {
  const originals = { window:globalThis.window, CustomEvent:globalThis.CustomEvent }
  globalThis.window = { dispatchEvent }
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail }
  }
  return () => {
    if (originals.window === undefined) delete globalThis.window
    else globalThis.window = originals.window
    if (originals.CustomEvent === undefined) delete globalThis.CustomEvent
    else globalThis.CustomEvent = originals.CustomEvent
  }
}

test('server state wins first sync and an unreviewed local value is backed up', () => {
  const storage = memoryStorage({ lslj_finance_v9:'{"local":true}' })
  const remoteValue = '{"remote":true}'
  const result = reconcileSharedRecords(storage, {
    lslj_finance_v9:{ value:remoteValue, hash:hashValue(remoteValue), updatedAt:'2026-09-07T10:00:00.000Z', version:4 },
  })
  assert.equal(storage.getItem('lslj_finance_v9'), remoteValue)
  assert.equal(storage.getItem('lslj_finance_v9_local_backup_before_cloud'), '{"local":true}')
  assert.deepEqual(result.applied, ['lslj_finance_v9'])
  assert.deepEqual(result.uploads, [])
  assert.deepEqual(result.blockedLocal, [])
  assert.equal(JSON.parse(storage.getItem('brevity_shared_state_meta_v1')).lslj_finance_v9.version, 4)
})

test('sync quarantines a local-only shared record without uploading it or repeatedly warning', async () => {
  const value = '[{"id":"local-project"}]'
  const storage = memoryStorage({
    homehq_items_v1:value,
    brevity_shared_state_meta_v1:JSON.stringify({ homehq_items_v1:{ hash:hashValue(value), version:7 } }),
  })
  const originalFetch = globalThis.fetch
  const restore = installBrowserGlobals()
  const requests = []
  globalThis.fetch = async (_url, options = {}) => {
    requests.push(options.method)
    return { ok:true, json:async () => ({ records:{} }) }
  }
  try {
    const result = await syncSharedState(storage)
    assert.deepEqual(requests, ['GET'])
    assert.deepEqual(result.uploads, [])
    assert.deepEqual(result.blockedLocal, ['homehq_items_v1'])
    assert.equal(result.rejected[0].reason.code, 'UNACKNOWLEDGED_LOCAL_STATE')
    assert.equal(storage.getItem('homehq_items_v1_local_backup_before_cloud'), value)
    assert.equal(storage.getItem('homehq_items_v1'), null)
    assert.equal(JSON.parse(storage.getItem('brevity_shared_state_meta_v1')).homehq_items_v1, undefined)
    assert.equal(getSharedStateHealth(storage).status, 'degraded')
    const retry = await syncSharedState(storage)
    assert.deepEqual(retry.blockedLocal, [])
    assert.deepEqual(retry.rejected, [])
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('generic shared JSON writes fail before changing the local or server record', () => {
  const prior = '[{"id":"reviewed"}]'
  const storage = memoryStorage({ homehq_items_v1:prior })
  const result = writeSharedJson(storage, 'homehq_items_v1', [{ id:'bypass' }])
  assert.equal(result.ok, false)
  assert.equal(result.requiresReview, true)
  assert.equal(result.error.code, 'ACTION_REVIEW_REQUIRED')
  assert.equal(result.upload, null)
  assert.equal(storage.getItem('homehq_items_v1'), prior)
  assert.equal(storage.getItem('homehq_items_v1_backup'), null)
  assert.equal(shouldUploadSharedWrite(storage, 'homehq_items_v1', 'anything'), false)
})

test('device-only preferences and category suggestions remain local rather than using household-state writes', () => {
  assert.equal(SHARED_STATE_KEYS.includes('brevity_finance_timeframe_v1'), false)
  assert.equal(SHARED_STATE_KEYS.includes('brevity_finance_categories_v1'), false)
  const storage = memoryStorage()
  const result = writeSharedJson(storage, 'brevity_finance_categories_v1', ['Pet Care'])
  assert.equal(result.ok, true)
  assert.equal(result.localOnly, true)
  assert.equal(storage.getItem('brevity_finance_categories_v1'), '["Pet Care"]')
})

test('the browser storage guard blocks raw shared-key writes but permits unrelated local preferences', () => {
  const originalStorage = globalThis.Storage
  const restore = installBrowserGlobals()
  class FakeStorage {
    constructor() { this.values = new Map() }
    getItem(key) { return this.values.get(String(key)) ?? null }
    setItem(key, value) { this.values.set(String(key), String(value)) }
  }
  globalThis.Storage = FakeStorage
  const storage = new FakeStorage()
  try {
    const stop = installSharedStateWriteThrough({ storage })
    storage.setItem('family_calendar_events_v1', '[{"id":"bypass"}]')
    storage.setItem('brevity_finance_timeframe_v1', '{"preset":"month"}')
    assert.equal(storage.getItem('family_calendar_events_v1'), null)
    assert.equal(storage.getItem('brevity_finance_timeframe_v1'), '{"preset":"month"}')
    assert.equal(getSharedStateHealth(storage).status, 'degraded')
    stop()
  } finally {
    if (originalStorage === undefined) delete globalThis.Storage
    else globalThis.Storage = originalStorage
    restore()
  }
})

test('direct Action version lookup permits only absent or exactly acknowledged records', () => {
  assert.equal(getAcknowledgedSharedStateVersion(memoryStorage(), 'homehq_items_v1'), 0)
  const value = '[{"id":"kitchen"}]'
  const acknowledged = memoryStorage({
    homehq_items_v1:value,
    brevity_shared_state_meta_v1:JSON.stringify({ homehq_items_v1:{ hash:hashValue(value), version:7 } }),
  })
  assert.equal(getAcknowledgedSharedStateVersion(acknowledged, 'homehq_items_v1'), 7)
  assert.throws(
    () => getAcknowledgedSharedStateVersion(memoryStorage({ homehq_items_v1:value }), 'homehq_items_v1'),
    error => error.code === 'SHARED_STATE_VERSION_UNAVAILABLE' && error.status === 409,
  )
})

test('dirty direct Action state and damaged metadata fail closed', () => {
  const value = '[{"id":"kitchen"}]'
  assert.throws(
    () => getAcknowledgedSharedStateVersion(memoryStorage({
      homehq_items_v1:value,
      brevity_shared_state_meta_v1:JSON.stringify({ homehq_items_v1:{ hash:hashValue('[]'), version:7 } }),
    }), 'homehq_items_v1'),
    error => error.code === 'SHARED_STATE_VERSION_UNAVAILABLE',
  )
  assert.throws(
    () => getAcknowledgedSharedStateVersion(memoryStorage({ homehq_items_v1:value, brevity_shared_state_meta_v1:'{bad' }), 'homehq_items_v1'),
    error => error.code === 'SHARED_STATE_VERSION_UNAVAILABLE',
  )
})

test('source imports are limited to Plaid records and send an explicit validated-ingestion request', async () => {
  const originalFetch = globalThis.fetch
  const restore = installBrowserGlobals()
  const storage = memoryStorage()
  let requestBody
  globalThis.fetch = async (_url, options = {}) => {
    requestBody = JSON.parse(options.body)
    return { ok:true, json:async () => ({ record:{ ...requestBody, version:1, updatedBy:'Larry', source:'plaid' } }) }
  }
  try {
    await assert.rejects(persistSharedSourceImport(storage, 'family_calendar_events_v1', []), /Only Plaid-managed finance source records/)
    const transactions = [{ id:'posted', accountId:'account', name:'AT&T', originalStatement:'ATT', amount:450, date:'2026-09-07', category:'UTILITIES', type:'expense', institution:'Pinnacle', pending:false }]
    const sourceReceipts = [{ cursorIdentity:'item-1', batchId:'a'.repeat(64) }]
    const result = await persistSharedSourceImport(storage, 'plaid_actuals_cache', transactions, { now:'2026-09-07T15:00:00.000Z', sourceReceipts })
    assert.equal(requestBody.writeMode, 'source-ingestion')
    assert.equal(requestBody.source, 'plaid')
    assert.equal(requestBody.expectedVersion, 0)
    assert.equal(requestBody.hash, hashValue(requestBody.value))
    assert.deepEqual(requestBody.sourceReceipts, sourceReceipts)
    assert.equal(result.durable, true)
    assert.deepEqual(JSON.parse(storage.getItem('plaid_actuals_cache')), transactions)
    assert.equal(JSON.parse(storage.getItem('brevity_shared_state_meta_v1')).plaid_actuals_cache.version, 1)
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('transaction source imports fail before the network without a server-issued receipt', async () => {
  const originalFetch = globalThis.fetch
  const restore = installBrowserGlobals()
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run') }
  try {
    await assert.rejects(
      persistSharedSourceImport(memoryStorage(), 'plaid_actuals_cache', []),
      error => error.code === 'SOURCE_RECEIPT_REQUIRED',
    )
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('account source imports fail before the network without a server-issued receipt', async () => {
  const originalFetch=globalThis.fetch
  const restore=installBrowserGlobals()
  let calls=0
  globalThis.fetch=async()=>{calls+=1;throw new Error('must not run')}
  try{
    await assert.rejects(
      persistSharedSourceImport(memoryStorage(), 'lslj_finance_v9', {accounts:[],transactions:[]}),
      error=>error.code==='SOURCE_RECEIPT_REQUIRED',
    )
    assert.equal(calls,0)
  }finally{
    globalThis.fetch=originalFetch
    restore()
  }
})

test('a durable snapshot with pending cursor acknowledgement is cached but reported stale', async () => {
  const originalFetch = globalThis.fetch
  const restore = installBrowserGlobals()
  const prior = JSON.stringify([{ id:'verified' }])
  const storage = memoryStorage({
    plaid_actuals_cache:prior,
    brevity_shared_state_meta_v1:JSON.stringify({ plaid_actuals_cache:{ hash:hashValue(prior), version:4 } }),
  })
  const next = [{ id:'new' }]
  globalThis.fetch = async (_url, options = {}) => {
    const request = JSON.parse(options.body)
    return { ok:true, json:async () => ({
      record:{ ...request, version:5 },
      sourceAcknowledgementPending:true,
      error:'Snapshot saved; cursor acknowledgement pending.',
    }) }
  }
  try {
    await assert.rejects(
      persistSharedSourceImport(storage, 'plaid_actuals_cache', next, { sourceReceipts:[{ cursorIdentity:'item-1', batchId:'a'.repeat(64) }] }),
      error => error.code === 'SOURCE_RECEIPT_ACK_PENDING',
    )
    assert.equal(storage.getItem('plaid_actuals_cache'), JSON.stringify(next))
    assert.equal(JSON.parse(storage.getItem('brevity_shared_state_meta_v1')).plaid_actuals_cache.version, 5)
    assert.equal(getSharedStateHealth(storage).status, 'degraded')
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('source data remains invisible until exact durable acknowledgement', async () => {
  const prior = JSON.stringify([{ id:'verified' }])
  const next = [{ id:'new' }]
  const storage = memoryStorage({
    plaid_actuals_cache:prior,
    brevity_shared_state_meta_v1:JSON.stringify({ plaid_actuals_cache:{ hash:hashValue(prior), version:4 } }),
  })
  const originalFetch = globalThis.fetch
  const restore = installBrowserGlobals()
  let release
  const gate = new Promise(resolve => { release = resolve })
  let started
  const didStart = new Promise(resolve => { started = resolve })
  globalThis.fetch = async (_url, options = {}) => {
    const request = JSON.parse(options.body)
    started()
    await gate
    return { ok:true, json:async () => ({ record:{ ...request, version:5 } }) }
  }
  try {
    const pending = persistSharedSourceImport(storage, 'plaid_actuals_cache', next, { sourceReceipts:[{ cursorIdentity:'item-1', batchId:'a'.repeat(64) }] })
    await didStart
    assert.equal(storage.getItem('plaid_actuals_cache'), prior)
    release()
    await pending
    assert.equal(storage.getItem('plaid_actuals_cache'), JSON.stringify(next))
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('failed, inexact, and conflicting source acknowledgements keep verified local truth', async () => {
  const prior = JSON.stringify([{ id:'verified' }])
  const meta = JSON.stringify({ plaid_actuals_cache:{ hash:hashValue(prior), version:4 } })
  const originalFetch = globalThis.fetch
  const restore = installBrowserGlobals()
  try {
    const unavailable = memoryStorage({ plaid_actuals_cache:prior, brevity_shared_state_meta_v1:meta })
    globalThis.fetch = async () => ({ ok:false, status:503, json:async () => ({ error:'Cloud unavailable.' }) })
    const sourceOptions = { sourceReceipts:[{ cursorIdentity:'item-1', batchId:'a'.repeat(64) }] }
    await assert.rejects(persistSharedSourceImport(unavailable, 'plaid_actuals_cache', [{ id:'new' }], sourceOptions), /Cloud unavailable/)
    assert.equal(unavailable.getItem('plaid_actuals_cache'), prior)

    const inexact = memoryStorage({ plaid_actuals_cache:prior, brevity_shared_state_meta_v1:meta })
    globalThis.fetch = async (_url, options = {}) => {
      const request = JSON.parse(options.body)
      const wrong = '[{"id":"wrong"}]'
      return { ok:true, json:async () => ({ record:{ ...request, value:wrong, hash:hashValue(wrong), version:5 } }) }
    }
    await assert.rejects(persistSharedSourceImport(inexact, 'plaid_actuals_cache', [{ id:'new' }], sourceOptions), error => error.code === 'SOURCE_IMPORT_NOT_ACKNOWLEDGED')
    assert.equal(inexact.getItem('plaid_actuals_cache'), prior)

    const conflict = memoryStorage({ plaid_actuals_cache:prior, brevity_shared_state_meta_v1:meta })
    const server = '[{"id":"newer-server"}]'
    globalThis.fetch = async () => ({ ok:true, json:async () => ({ conflict:true, error:'Changed.', record:{ key:'plaid_actuals_cache', value:server, hash:hashValue(server), version:5 } }) })
    await assert.rejects(persistSharedSourceImport(conflict, 'plaid_actuals_cache', [{ id:'stale' }], sourceOptions), error => error.code === 'VERSION_CONFLICT' && error.status === 409)
    assert.equal(conflict.getItem('plaid_actuals_cache'), server)
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('a local mutation racing a source request cannot be presented as a completed refresh', async () => {
  const prior = '{"accounts":[],"transactions":[]}'
  const next = { accounts:[], transactions:[] }
  const storage = memoryStorage({
    lslj_finance_v9:prior,
    brevity_shared_state_meta_v1:JSON.stringify({ lslj_finance_v9:{ hash:hashValue(prior), version:2 } }),
  })
  const originalFetch = globalThis.fetch
  const restore = installBrowserGlobals()
  let release
  const gate = new Promise(resolve => { release = resolve })
  let started
  const didStart = new Promise(resolve => { started = resolve })
  globalThis.fetch = async (_url, options = {}) => {
    const request = JSON.parse(options.body)
    started()
    await gate
    return { ok:true, json:async () => ({ record:{ ...request, version:3 } }) }
  }
  try {
    const pending = persistSharedSourceImport(storage, 'lslj_finance_v9', next, { accountSourceReceipt:{ payload:'verified', signature:'a'.repeat(64) } })
    await didStart
    storage.setItem('lslj_finance_v9', '{"unreviewed":true}')
    release()
    await assert.rejects(pending, error => error.code === 'SOURCE_IMPORT_SUPERSEDED' && error.status === 409)
    assert.equal(storage.getItem('lslj_finance_v9'), '{"unreviewed":true}')
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('record construction retains the exact acknowledged CAS version', () => {
  const value = '[]'
  const storage = memoryStorage({
    brevity_shared_state_meta_v1:JSON.stringify({ plaid_actuals_cache:{ hash:hashValue(value), version:9 } }),
  })
  assert.deepEqual(buildSharedRecord(storage, 'plaid_actuals_cache', value, '2026-09-07T15:00:00.000Z'), {
    key:'plaid_actuals_cache', value, hash:hashValue(value), updatedAt:'2026-09-07T15:00:00.000Z', expectedVersion:9,
  })
})

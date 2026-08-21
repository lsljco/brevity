import test from 'node:test'
import assert from 'node:assert/strict'
import { hashValue, reconcileSharedRecords } from './sharedState.js'

function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values))
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), dump: () => Object.fromEntries(data) }
}

test('first cloud sync preserves server data and backs up an untracked local value', () => {
  const storage = memoryStorage({ lslj_finance_v9: '{"local":true}' })
  const remoteValue = '{"remote":true}'
  const result = reconcileSharedRecords(storage, {
    lslj_finance_v9: { value: remoteValue, hash: hashValue(remoteValue), updatedAt: '2026-08-21T10:00:00.000Z' },
  }, '2026-08-21T11:00:00.000Z')
  assert.equal(storage.getItem('lslj_finance_v9'), remoteValue)
  assert.equal(storage.getItem('lslj_finance_v9_local_backup_before_cloud'), '{"local":true}')
  assert.deepEqual(result.applied, ['lslj_finance_v9'])
})

test('a tracked local edit is uploaded instead of overwritten by older cloud state', () => {
  const old = '{"value":1}'
  const current = '{"value":2}'
  const storage = memoryStorage({
    lslj_finance_v9: current,
    brevity_shared_state_meta_v1: JSON.stringify({ lslj_finance_v9: { hash: hashValue(old), updatedAt: '2026-08-21T09:00:00.000Z' } }),
  })
  const result = reconcileSharedRecords(storage, {
    lslj_finance_v9: { value: old, hash: hashValue(old), updatedAt: '2026-08-21T09:00:00.000Z' },
  }, '2026-08-21T11:00:00.000Z')
  assert.equal(result.uploads[0].value, current)
  assert.equal(result.uploads[0].updatedAt, '2026-08-21T11:00:00.000Z')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateRepository } from '../../netlify/lib/estate-store.mjs'
import { createEstateWorkspace } from './estateModel.js'

function memoryStore() {
  const records = new Map()
  return {
    records,
    async get(key) { return records.get(key) || null },
    async setJSON(key, value) { records.set(key, structuredClone(value)) },
  }
}

test('persists a versioned workspace, immutable backup and audit entry', async () => {
  const store = memoryStore()
  const repository = createEstateRepository({ store, now: () => new Date('2026-08-26T12:00:00.000Z'), createId: () => 'audit-1' })
  const saved = await repository.saveWorkspace({ workspace: createEstateWorkspace(), expectedVersion: 0, actor: 'Larry', reason: 'estate.malbec-imported' })
  assert.equal(saved.version, 1)
  assert.equal(saved.updatedBy, 'Larry')
  assert.ok(store.records.has('lslj-family/backups/property-malbec-estate/v1'))
  assert.ok(store.records.has('lslj-family/audit/property-malbec-estate/2026-08-26/audit-1'))
})

test('prevents stale devices from overwriting Estate records', async () => {
  const store = memoryStore()
  const repository = createEstateRepository({ store })
  const workspace = createEstateWorkspace()
  await repository.saveWorkspace({ workspace, expectedVersion: 0, actor: 'Larry' })
  await assert.rejects(repository.saveWorkspace({ workspace, expectedVersion: 0, actor: 'Terica' }), error => error.code === 'VERSION_CONFLICT')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createEstateRepository } from '../../netlify/lib/estate-store.mjs'

function memoryStore() {
  const values = new Map()
  return {
    values,
    async get(key) { return structuredClone(values.get(key) ?? null) },
    async setJSON(key, value) { values.set(key, structuredClone(value)); return { modified: true } },
    async list({ prefix }) { return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) } },
  }
}

test('Estate repository stores one versioned record per entity and commits audit entries', async () => {
  const store = memoryStore()
  let tick = 0
  const repository = createEstateRepository({
    store,
    householdId: 'lslj-family',
    now: () => `2026-08-23T10:00:0${tick++}.000Z`,
    randomUUID: () => `uuid-${tick}`,
  })
  const created = await repository.save({
    entityType: 'property',
    expectedVersion: 0,
    actor: 'Larry',
    entity: { id: 'property-malbec-estate', name: 'Malbec Estate', status: 'active' },
  })
  assert.equal(created.version, 1)
  const updated = await repository.save({
    entityType: 'property',
    expectedVersion: 1,
    actor: 'Larry',
    entity: { ...created, timeZone: 'America/New_York' },
  })
  assert.equal(updated.version, 2)
  assert.equal(updated.createdAt, created.createdAt)
  const audit = [...store.values.entries()].filter(([key]) => key.includes('/audit/')).map(([, value]) => value)
  assert.equal(audit.length, 4)
  assert.equal(audit.filter(entry => entry.state === 'committed').length, 2)
  assert.equal(audit.filter(entry => entry.state === 'pending').length, 2)
  const exported = await repository.exportAll()
  assert.equal(exported.auditCount, 2)
  assert.equal(exported.incompleteAuditCount, 0)
})

test('Estate repository rejects stale writes and archives instead of hard deleting', async () => {
  const store = memoryStore()
  const repository = createEstateRepository({ store, householdId: 'lslj-family', now: () => '2026-08-23T10:00:00.000Z', randomUUID: () => 'uuid' })
  const created = await repository.save({ entityType: 'property', expectedVersion: 0, actor: 'Larry', entity: { id: 'property-1', name: 'Property One' } })
  await assert.rejects(() => repository.save({ entityType: 'property', expectedVersion: 9, actor: 'Larry', entity: { ...created, name: 'Stale' } }), /changed from version 9 to 1/)
  const archived = await repository.archive({ entityType: 'property', id: created.id, expectedVersion: 1, actor: 'Larry' })
  assert.equal(archived.status, 'archived')
  assert.equal((await repository.list('property')).length, 0)
  assert.equal((await repository.list('property', { includeArchived: true })).length, 1)
})

test('Estate repository propagates storage failures instead of returning incomplete records', async () => {
  const store = {
    async list() { return { blobs: [{ key: 'lslj-family/entities/property/property-1' }] } },
    async get() { throw new Error('blob service unavailable') },
  }
  const repository = createEstateRepository({ store, householdId: 'lslj-family' })
  await assert.rejects(() => repository.list('property'), /blob service unavailable/)
  await assert.rejects(() => repository.get('property', 'property-1'), /blob service unavailable/)
})

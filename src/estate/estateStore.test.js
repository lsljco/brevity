import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateRepository } from '../../netlify/lib/estate-store.mjs'
import { createEstateWorkspace } from './estateModel.js'

function memoryStore() {
  const records = new Map()
  const etags = new Map()
  let revision = 0
  return {
    records,
    async get(key) { return records.get(key) || null },
    async getWithMetadata(key) { return records.has(key) ? { data: structuredClone(records.get(key)), etag: etags.get(key) } : null },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified: false }
      if (options.onlyIfMatch && options.onlyIfMatch !== etags.get(key)) return { modified: false }
      const etag = `etag-${++revision}`
      records.set(key, structuredClone(value)); etags.set(key, etag)
      return { modified: true, etag }
    },
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

test('uses atomic storage CAS and writes backup and audit only for the winning Estate update', async () => {
  const store = memoryStore()
  let releaseReads
  const readsReleased = new Promise(resolve => { releaseReads = resolve })
  let matchingReads = 0
  const originalGet = store.getWithMetadata
  store.getWithMetadata = async key => {
    const result = await originalGet(key)
    if (key.endsWith('/workspaces/property-malbec-estate') && result?.data?.version === 1) {
      matchingReads += 1
      if (matchingReads === 2) releaseReads()
      await readsReleased
    }
    return result
  }
  let auditId = 0
  const repository = createEstateRepository({ store, createId: () => `audit-${++auditId}` })
  const current = await repository.saveWorkspace({ workspace: createEstateWorkspace(), expectedVersion: 0, actor: 'Larry' })
  const first = repository.saveWorkspace({ workspace: { ...current, projects: [{ id: 'one', propertyId: current.propertyId, title: 'One' }] }, expectedVersion: 1, actor: 'Larry' })
  const second = repository.saveWorkspace({ workspace: { ...current, projects: [{ id: 'two', propertyId: current.propertyId, title: 'Two' }] }, expectedVersion: 1, actor: 'Terica' })
  const outcomes = await Promise.allSettled([first, second])
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected' && outcome.reason.code === 'VERSION_CONFLICT').length, 1)
  const final = await repository.getWorkspace(current.propertyId)
  assert.equal(final.version, 2)
  assert.equal([...store.records.keys()].filter(key => key.includes('/backups/') && key.endsWith('/v2')).length, 1)
  assert.equal([...store.records.keys()].filter(key => key.includes('/audit/') && store.records.get(key)?.toVersion === 2).length, 1)
})

test('requires the reviewed version and propagates storage outages', async () => {
  const store = memoryStore()
  const repository = createEstateRepository({ store })
  const current = await repository.saveWorkspace({ workspace: createEstateWorkspace(), expectedVersion: 0, actor: 'Larry' })
  await assert.rejects(repository.saveWorkspace({ workspace: current, actor: 'Larry' }), error => error.code === 'VERSION_CONFLICT')

  const outage = createEstateRepository({ store: {
    async getWithMetadata() { throw Object.assign(new Error('blob transport down'), { statusCode: 503 }) },
  } })
  await assert.rejects(outage.getWorkspace(current.propertyId), /blob transport down/)

  const genuinelyMissing = createEstateRepository({ store: {
    async getWithMetadata() { throw Object.assign(new Error('not found'), { name: 'NotFoundError' }) },
  } })
  assert.equal(await genuinelyMissing.getWorkspace(current.propertyId), null)
})

test('repairs immutable Estate history after a post-CAS storage failure without applying the mutation twice', async () => {
  const store = memoryStore()
  let auditId = 0
  const repository = createEstateRepository({ store, createId: () => `audit-${++auditId}` })
  const current = await repository.saveWorkspace({ workspace: createEstateWorkspace(), expectedVersion: 0, actor: 'Larry' })
  const workspaceKey = 'lslj-family/workspaces/property-malbec-estate'
  let workspaceWrites = 0
  let failAudit = true
  const originalSetJSON = store.setJSON
  store.setJSON = async (key, value, options) => {
    if (key === workspaceKey) workspaceWrites += 1
    if (failAudit && key.includes('/audit/') && value?.toVersion === 2) {
      failAudit = false
      throw Object.assign(new Error('audit storage unavailable'), { statusCode: 503 })
    }
    return originalSetJSON(key, value, options)
  }
  const proposed = { ...current, projects: [{ id: 'project-repair', propertyId: current.propertyId, title: 'Repair proof' }] }
  const requestFingerprint = 'estate-request-one'

  await assert.rejects(
    repository.saveWorkspace({ workspace: proposed, expectedVersion: 1, actor: 'Larry', requestFingerprint }),
    /audit storage unavailable/,
  )
  assert.equal(store.records.get(workspaceKey).version, 2)
  assert.equal(workspaceWrites, 1)
  assert.equal([...store.records.keys()].some(key => key.includes('/artifact-status/') && key.includes('v2-')), false)

  const retried = await repository.saveWorkspace({ workspace: proposed, expectedVersion: 1, actor: 'Larry', requestFingerprint })
  assert.equal(retried.version, 2)
  assert.equal(retried.projects[0].id, 'project-repair')
  assert.equal(workspaceWrites, 1)
  assert.equal([...store.records.keys()].filter(key => key.includes('/backups/') && key.endsWith('/v2')).length, 1)
  assert.equal([...store.records.keys()].filter(key => key.includes('/audit/') && store.records.get(key)?.toVersion === 2).length, 1)
  assert.equal([...store.records.keys()].filter(key => key.includes('/artifact-status/') && key.includes('v2-')).length, 1)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateVaultHandler } from '../../netlify/functions/estate-vault.mjs'
import { createEstateRepository } from '../../netlify/lib/estate-store.mjs'
import { createEstateVaultRepository } from '../../netlify/lib/estate-vault-store.mjs'
import { createEstateWorkspace } from './estateModel.js'

function memoryStore() {
  const records = new Map()
  return {
    records,
    async get(key) { return records.get(key) ?? null },
    async set(key, value) { records.set(key, Buffer.isBuffer(value) ? Buffer.from(value) : value) },
    async setJSON(key, value) { records.set(key, structuredClone(value)) },
    async delete(key) { records.delete(key) },
  }
}

function checksum(value) {
  let hash = 2166136261
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

const event = ({ method = 'POST', body, documentId } = {}) => ({
  httpMethod: method,
  body: body == null ? undefined : JSON.stringify(body),
  queryStringParameters: { propertyId: 'property-malbec-estate', ...(documentId ? { documentId } : {}) },
})

async function fixture() {
  const estateStore = memoryStore()
  const vaultStore = memoryStore()
  const workspaceRepository = createEstateRepository({ store: estateStore, now: () => new Date('2026-08-27T02:00:00.000Z'), createId: () => 'vault-audit' })
  const base64 = Buffer.from('hello').toString('base64')
  const sourceChecksum = checksum(base64)
  const workspace = createEstateWorkspace({ now: '2026-08-26T00:00:00.000Z' })
  workspace.workOrders = [{ id: 'work-order-1', propertyId: workspace.propertyId, title: 'Pool repair', legacySource: { storageKey: 'malbecHOS_maintenance_maintenance', sourceIndex: 0 } }]
  workspace.migration = { pendingFiles: [{ id: 'legacy-file-1', path: 'malbecHOS_maintenance_maintenance[0].photos[0]', mimeType: 'image/png', byteEstimate: 5, sourceChecksum, status: 'pending-document-import' }] }
  await workspaceRepository.saveWorkspace({ workspace, expectedVersion: 0, actor: 'Larry', reason: 'test.setup' })
  const vaultRepository = createEstateVaultRepository({ store: vaultStore })
  const handler = createEstateVaultHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    workspaceRepositoryFactory: async () => workspaceRepository,
    vaultRepositoryFactory: async () => vaultRepository,
    now: () => new Date('2026-08-27T03:00:00.000Z'),
  })
  return { base64, sourceChecksum, workspaceRepository, vaultRepository, handler }
}

test('Estate Vault requires authentication and administrator permission for uploads', async () => {
  const unauthenticated = createEstateVaultHandler({ authenticate: async () => null })
  assert.equal((await unauthenticated(event())).statusCode, 401)
  const member = createEstateVaultHandler({
    authenticate: async () => ({ member: 'Terica', role: 'member' }),
    workspaceRepositoryFactory: async () => ({ getWorkspace: async () => createEstateWorkspace() }),
    vaultRepositoryFactory: async () => ({}),
  })
  assert.equal((await member(event({ body: {} }))).statusCode, 403)
})

test('imports chunks, verifies both hashes, relates the document, and supports authenticated download', async () => {
  const { base64, sourceChecksum, workspaceRepository, vaultRepository, handler } = await fixture()
  const file = { fileId: 'legacy-file-1', sourcePath: 'malbecHOS_maintenance_maintenance[0].photos[0]', sourceChecksum, totalChunks: 1 }
  const chunk = await handler(event({ body: { action: 'chunk', ...file, chunkIndex: 0, base64 } }))
  assert.equal(chunk.statusCode, 202)
  const finalized = await handler(event({ body: { action: 'finalize', ...file, expectedVersion: 1 } }))
  assert.equal(finalized.statusCode, 201)
  const payload = JSON.parse(finalized.body)
  assert.equal(payload.workspace.version, 2)
  assert.equal(payload.document.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  assert.deepEqual(payload.document.relatedEntityIds, ['work-order-1'])
  assert.equal(payload.workspace.migration.pendingFiles[0].status, 'imported')
  assert.equal((await workspaceRepository.getWorkspace('property-malbec-estate')).documents.length, 1)

  const repeated = await handler(event({ body: { action: 'finalize', ...file, expectedVersion: 1 } }))
  assert.equal(repeated.statusCode, 200)
  assert.equal(JSON.parse(repeated.body).workspace.version, 2)

  const memberHandler = createEstateVaultHandler({
    authenticate: async () => ({ member: 'Terica', role: 'member' }),
    workspaceRepositoryFactory: async () => workspaceRepository,
    vaultRepositoryFactory: async () => vaultRepository,
  })
  const download = await memberHandler(event({ method: 'GET', documentId: payload.document.id }))
  assert.equal(download.statusCode, 200)
  assert.equal(Buffer.from(download.body, 'base64').toString(), 'hello')
  assert.equal(download.headers['cache-control'], 'private, no-store')
})

test('rejects reconstructed bytes that do not match the pending source checksum', async () => {
  const { sourceChecksum, workspaceRepository, handler } = await fixture()
  const file = { fileId: 'legacy-file-1', sourcePath: 'malbecHOS_maintenance_maintenance[0].photos[0]', sourceChecksum, totalChunks: 1 }
  const different = Buffer.from('world').toString('base64')
  await handler(event({ body: { action: 'chunk', ...file, chunkIndex: 0, base64: different } }))
  const finalized = await handler(event({ body: { action: 'finalize', ...file, expectedVersion: 1 } }))
  assert.equal(finalized.statusCode, 409)
  assert.match(JSON.parse(finalized.body).error, /source checksum/)
  assert.equal((await workspaceRepository.getWorkspace('property-malbec-estate')).version, 1)
})

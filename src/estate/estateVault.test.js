import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateVaultHandler } from '../../netlify/functions/estate-vault.mjs'

const event = ({ method = 'POST', body, documentId } = {}) => ({
  httpMethod: method,
  body: body == null ? undefined : JSON.stringify(body),
  queryStringParameters: { propertyId: 'property-malbec-estate', ...(documentId ? { documentId } : {}) },
})

test('Estate Vault requires household authentication before reads or blocked uploads', async () => {
  let repositoriesOpened = 0
  const unauthenticated = createEstateVaultHandler({
    authenticate: async () => null,
    workspaceRepositoryFactory: async () => { repositoriesOpened += 1 },
    vaultRepositoryFactory: async () => { repositoriesOpened += 1 },
  })
  assert.equal((await unauthenticated(event())).statusCode, 401)
  assert.equal(repositoriesOpened, 0)
})

test('authenticated Estate Vault chunk and finalize calls fail closed before any repository write', async () => {
  let repositoriesOpened = 0
  const handler = createEstateVaultHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    workspaceRepositoryFactory: async () => { repositoriesOpened += 1; throw new Error('must not open workspace repository') },
    vaultRepositoryFactory: async () => { repositoriesOpened += 1; throw new Error('must not open vault repository') },
  })
  for (const action of ['chunk', 'finalize']) {
    const result = await handler(event({ body: { action, base64: 'aGVsbG8=', expectedVersion: 1 } }))
    assert.equal(result.statusCode, 423)
    const payload = JSON.parse(result.body)
    assert.equal(payload.code, 'ACTION_REVIEW_REQUIRED')
    assert.match(payload.error, /No upload chunks or Estate records were changed/i)
  }
  assert.equal(repositoriesOpened, 0)
})

test('existing verified Estate documents remain available as authenticated read-only downloads', async () => {
  let workspaceReads = 0
  let vaultReads = 0
  const handler = createEstateVaultHandler({
    authenticate: async () => ({ member: 'Terica', role: 'member' }),
    workspaceRepositoryFactory: async () => ({
      getWorkspace: async propertyId => {
        workspaceReads += 1
        assert.equal(propertyId, 'property-malbec-estate')
        return { documents: [{ id: 'document-one', fileName: 'inspection.txt', mimeType: 'text/plain', storage: { key: 'verified-file' } }] }
      },
    }),
    vaultRepositoryFactory: async () => ({
      getFile: async key => {
        vaultReads += 1
        assert.equal(key, 'verified-file')
        return Buffer.from('verified contents')
      },
    }),
  })
  const result = await handler(event({ method: 'GET', documentId: 'document-one' }))
  assert.equal(result.statusCode, 200)
  assert.equal(Buffer.from(result.body, 'base64').toString(), 'verified contents')
  assert.equal(result.headers['cache-control'], 'private, no-store')
  assert.equal(workspaceReads, 1)
  assert.equal(vaultReads, 1)
})

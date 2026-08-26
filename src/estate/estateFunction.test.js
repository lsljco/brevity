import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateHandler } from '../../netlify/functions/estate.mjs'
import { createEstateWorkspace } from './estateModel.js'

const event = ({ method = 'GET', body, propertyId } = {}) => ({
  httpMethod: method,
  body: body == null ? undefined : JSON.stringify(body),
  queryStringParameters: propertyId ? { propertyId } : {},
})

test('Estate API requires household authentication', async () => {
  const handler = createEstateHandler({ authenticate: async () => null, repositoryFactory: async () => { throw new Error('must not reach repository') } })
  const response = await handler(event())
  assert.equal(response.statusCode, 401)
})

test('Estate reads are household-authenticated and do not create data', async () => {
  let requestedProperty
  const handler = createEstateHandler({
    authenticate: async () => ({ member: 'Terica', role: 'member' }),
    repositoryFactory: async () => ({ getWorkspace: async propertyId => { requestedProperty = propertyId; return null } }),
  })
  const response = await handler(event())
  assert.equal(response.statusCode, 200)
  assert.equal(requestedProperty, 'property-malbec-estate')
  assert.equal(JSON.parse(response.body).workspace, null)
})

test('legacy import is dry-run by default and commit is admin-only', async () => {
  const transformed = { workspace: createEstateWorkspace(), report: { counts: { workOrders: 0 } } }
  let saves = 0
  const repository = { saveWorkspace: async input => { saves += 1; return { ...input.workspace, version: 1 } } }
  const memberHandler = createEstateHandler({
    authenticate: async () => ({ member: 'Terica', role: 'member' }),
    repositoryFactory: async () => repository,
    transform: () => transformed,
  })
  assert.equal((await memberHandler(event({ method: 'POST', body: { backup: {} } }))).statusCode, 403)

  const adminHandler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => repository,
    transform: () => transformed,
  })
  const preview = await adminHandler(event({ method: 'POST', body: { backup: {} } }))
  assert.equal(preview.statusCode, 200)
  assert.equal(JSON.parse(preview.body).dryRun, true)
  assert.equal(saves, 0)

  const committed = await adminHandler(event({ method: 'POST', body: { backup: {}, commit: true, expectedVersion: 0 } }))
  assert.equal(committed.statusCode, 201)
  assert.equal(JSON.parse(committed.body).workspace.version, 1)
  assert.equal(saves, 1)
})

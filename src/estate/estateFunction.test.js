import assert from 'node:assert/strict'
import test from 'node:test'
import { createEstateHandler } from '../../netlify/functions/estate.mjs'
import { createEstateRepository } from '../../netlify/lib/estate-store.mjs'
import { createEstateWorkspace } from './estateModel.js'
import { prepareMalbecBackup } from './malbecBackup.js'

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
  const transformed = { workspace: createEstateWorkspace(), report: { counts: { workOrders: 1, projects: 0 }, sourceInspection: { sourceChecksum: 'verified-source', blockingIssues: [] } } }
  let saves = 0
  const repository = { getWorkspace: async () => null, saveWorkspace: async input => { saves += 1; return { ...input.workspace, version: 1 } } }
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

test('initial import cannot overwrite an existing Estate workspace', async () => {
  const transformed = { workspace: createEstateWorkspace(), report: { counts: { workOrders: 1 }, sourceInspection: { sourceChecksum: 'verified-source', blockingIssues: [] } } }
  const handler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => ({ getWorkspace: async () => ({ version: 1 }), saveWorkspace: async () => { throw new Error('must not overwrite') } }),
    transform: () => transformed,
  })
  const response = await handler(event({ method: 'POST', body: { backup: {}, commit: true, expectedVersion: 1 } }))
  assert.equal(response.statusCode, 409)
  assert.match(JSON.parse(response.body).error, /reconciliation instead of replacing/i)
})

test('reported duplicate ids block commit before persistence', async () => {
  const transformed = { workspace: createEstateWorkspace(), report: { counts: { workOrders: 1 }, sourceInspection: { sourceChecksum: 'verified-source', blockingIssues: ['Duplicate ids require review.'] } } }
  const handler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => ({ getWorkspace: async () => null, saveWorkspace: async () => { throw new Error('must not save') } }),
    transform: () => transformed,
  })
  const response = await handler(event({ method: 'POST', body: { backup: {}, commit: true, expectedVersion: 0 } }))
  assert.equal(response.statusCode, 400)
})

test('commit requires a verified export checksum and at least one property record', async () => {
  const baseOptions = {
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => ({ getWorkspace: async () => null, saveWorkspace: async () => { throw new Error('must not save') } }),
  }
  const noChecksum = createEstateHandler({ ...baseOptions, transform: () => ({ workspace: createEstateWorkspace(), report: { counts: { workOrders: 1 }, sourceInspection: { blockingIssues: [] } } }) })
  assert.equal((await noChecksum(event({ method: 'POST', body: { backup: {}, commit: true } }))).statusCode, 400)
  const empty = createEstateHandler({ ...baseOptions, transform: () => ({ workspace: createEstateWorkspace(), report: { counts: { workOrders: 0, projects: 0 }, sourceInspection: { sourceChecksum: 'verified', blockingIssues: [] } } }) })
  assert.equal((await empty(event({ method: 'POST', body: { backup: {}, commit: true } }))).statusCode, 400)
})

test('actual Malbec export shape completes inspect, preview, commit and read-back', async () => {
  const records = new Map()
  const repository = createEstateRepository({
    store: { get: async key => records.get(key) || null, setJSON: async (key, value) => records.set(key, structuredClone(value)) },
    now: () => new Date('2026-08-26T14:00:00.000Z'),
    createId: () => 'audit-e2e',
  })
  const handler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => repository,
  })
  const source = { exportedAt: '2026-08-26T13:00:00.000Z', appVersion: 'MalbecEstateHOS', data: {
    malbecHOS_maintenance_maintenance: JSON.stringify([{ id: 11, title: 'Pool service', cat: 'Pool', stage: 'Scheduled' }]),
    malbecHOS_maintenance_projects: JSON.stringify([{ id: 12, title: 'Terrace repair', cat: 'Exterior', status: 'In Progress' }]),
  } }
  const { prepared, inspection } = prepareMalbecBackup(source, { sourceFileName: 'malbec-hos-backup-2026-08-26.json', sourceBytes: 1000 })
  const preview = await handler(event({ method: 'POST', body: { backup: prepared, sourceInspection: inspection } }))
  assert.equal(preview.statusCode, 200)
  assert.equal(JSON.parse(preview.body).report.counts.workOrders, 1)
  const committed = await handler(event({ method: 'POST', body: { backup: prepared, sourceInspection: inspection, commit: true, expectedVersion: 0 } }))
  assert.equal(committed.statusCode, 201)
  const readBack = await handler(event())
  const workspace = JSON.parse(readBack.body).workspace
  assert.equal(workspace.version, 1)
  assert.equal(workspace.migration.sourceExportedAt, source.exportedAt)
  assert.equal(workspace.projects[0].title, 'Terrace repair')
})

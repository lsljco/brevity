import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createEstateHandler } from '../../netlify/functions/estate.mjs'
import { commitMalbecBackup, importEstateVaultFile } from './estateApi.js'
import { createEstateWorkspace } from './estateModel.js'
import { compareMalbecExports, prepareMalbecBackup, reconciliationInspection } from './malbecBackup.js'

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

test('Estate client and migration UI expose preview only and cannot start an import request',async()=>{
  const originalFetch=global.fetch
  let fetchCalls=0
  global.fetch=async()=>{fetchCalls+=1;throw new Error('must not fetch')}
  try{
    for(const operation of [commitMalbecBackup,importEstateVaultFile]){
      await assert.rejects(operation({}),error=>error.status===423&&error.code==='ACTION_REVIEW_REQUIRED')
    }
    assert.equal(fetchCalls,0)
  }finally{global.fetch=originalFetch}
  const ui=readFileSync(new URL('./MalbecMigrationConsole.jsx',import.meta.url),'utf8')
  assert.match(ui,/Estate import unavailable/)
  assert.match(ui,/Estate Vault import unavailable/)
  assert.doesNotMatch(ui,/onClick=\{commit\}|onClick=\{importPendingFiles\}/)
})

test('legacy import remains preview-only and commit fails closed before persistence', async () => {
  const transformed = { workspace: createEstateWorkspace(), report: { counts: { workOrders: 1, projects: 0 }, validation: { recordCountMatches: true }, sourceInspection: { sourceChecksum: 'verified-source', preparedChecksumVerified: true, blockingIssues: [] } } }
  let transforms = 0
  const memberHandler = createEstateHandler({
    authenticate: async () => ({ member: 'Terica', role: 'member' }),
    repositoryFactory: async () => { throw new Error('must not open repository') },
    transform: () => { transforms += 1; return transformed },
  })
  assert.equal((await memberHandler(event({ method: 'POST', body: { backup: {} } }))).statusCode, 403)
  assert.equal(transforms, 0)

  const adminHandler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => { throw new Error('must not open repository') },
    transform: () => { transforms += 1; return transformed },
  })
  const preview = await adminHandler(event({ method: 'POST', body: { backup: {} } }))
  assert.equal(preview.statusCode, 200)
  assert.equal(JSON.parse(preview.body).dryRun, true)
  assert.equal(transforms, 1)

  const committed = await adminHandler(event({ method: 'POST', body: { backup: {}, commit: true, expectedVersion: 0 } }))
  assert.equal(committed.statusCode, 423)
  assert.equal(JSON.parse(committed.body).code, 'ACTION_REVIEW_REQUIRED')
  assert.match(JSON.parse(committed.body).error, /No Estate records were changed/i)
  assert.equal(transforms, 1)
})

test('actual Malbec export shape still completes inspect and preview without opening Estate storage', async () => {
  const handler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => { throw new Error('preview must not open repository') },
  })
  const source = { exportedAt: '2026-08-26T13:00:00.000Z', appVersion: 'MalbecEstateHOS', data: {
    malbecHOS_maintenance_maintenance: JSON.stringify([{ id: 11, title: 'Pool service', cat: 'Pool', stage: 'Scheduled' }]),
    malbecHOS_maintenance_projects: JSON.stringify([{ id: 12, title: 'Terrace repair', cat: 'Exterior', status: 'In Progress' }]),
  } }
  const { prepared, inspection } = prepareMalbecBackup(source, { sourceFileName: 'malbec-hos-backup-2026-08-26.json', sourceBytes: 1000 })
  const preview = await handler(event({ method: 'POST', body: { backup: prepared, sourceInspection: inspection } }))
  assert.equal(preview.statusCode, 200)
  assert.equal(JSON.parse(preview.body).report.counts.workOrders, 1)
  assert.equal(JSON.parse(preview.body).report.counts.projects, 1)
})

test('payload changes after inspection fail checksum and count reconciliation gates', async () => {
  const handler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => { throw new Error('preview must not open repository') },
  })
  const { prepared, inspection } = prepareMalbecBackup({ records: {
    malbecHOS_maintenance_maintenance: [{ id: 1, title: 'Original service' }],
  } })
  prepared.records.malbecHOS_maintenance_maintenance.push({ id: 2, title: 'Added after inspection' })
  const preview = await handler(event({ method: 'POST', body: { backup: prepared, sourceInspection: inspection } }))
  const previewBody = JSON.parse(preview.body)
  assert.equal(previewBody.report.validation.preparedChecksumVerified, false)
  assert.equal(previewBody.report.validation.recordCountMatches, false)
  const committed = await handler(event({ method: 'POST', body: { backup: prepared, sourceInspection: inspection, commit: true, expectedVersion: 0 } }))
  assert.equal(committed.statusCode, 423)
})

test('exact Malbec code defaults stay blocked until reviewed and can be excluded without shifting source indexes', async () => {
  const handler = createEstateHandler({
    authenticate: async () => ({ member: 'Larry', role: 'admin' }),
    repositoryFactory: async () => ({ getWorkspace: async () => null, saveWorkspace: async () => { throw new Error('preview only') } }),
  })
  const exactDefault = { id: 6, title: 'Gutter Cleaning', desc: 'Spring cleaning', cat: 'Exterior', owner: 'Larry', stage: 'Completed', scheduledDate: null, updated: '2026-06-15', updatedBy: 'Larry' }
  const source = prepareMalbecBackup({ records: { malbecHOS_maintenance_maintenance: [exactDefault, { id: 77, title: 'Real pool repair', cat: 'Pool' }] } }, { sourceFileName: 'malbec.json' })
  const comparison = compareMalbecExports([source])
  const unresolvedInspection = reconciliationInspection([source], comparison, 0)
  const unresolved = JSON.parse((await handler(event({ method: 'POST', body: { backup: source.prepared, sourceInspection: unresolvedInspection } }))).body)
  assert.equal(unresolved.report.seedReview.unresolvedCount, 1)
  assert.equal(unresolved.report.validation.readyForImport, false)

  const resolvedInspection = reconciliationInspection([source], comparison, 0, [{ ...source.inspection.seedCandidates[0], action: 'exclude' }])
  const resolved = JSON.parse((await handler(event({ method: 'POST', body: { backup: source.prepared, sourceInspection: resolvedInspection } }))).body)
  assert.equal(resolved.report.counts.workOrders, 1)
  assert.equal(resolved.report.validation.excludedSeedCount, 1)
  assert.equal(resolved.report.validation.recordCountMatches, true)
  assert.equal(resolved.report.validation.readyForImport, true)
  assert.equal(resolved.workspace.workOrders[0].legacySource.sourceIndex, 1)
})

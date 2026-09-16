import assert from 'node:assert/strict'
import test from 'node:test'
import { createSermonDeviceRescueHandler } from '../../netlify/functions/sermon-device-rescue.mjs'

function memoryStore() {
  const records = new Map()
  return {
    records,
    async get(key) { return records.has(key) ? structuredClone(records.get(key)) : null },
    async setJSON(key, value) { records.set(key, structuredClone(value)) },
  }
}

const sermon = notes => ({ id: 'legacy-1', savedAt: '2026-08-20T10:00:00.000Z', sermon: { sermon_title: 'A Preserved Word' }, notes: { body: notes }, quotes: [], infographics: [] })
const deviceExport = (label = 'Lorenzo iPhone', notes = 'Original notes') => ({
  format: 'apostolic-sermon-device-export', schemaVersion: 1, exportedAt: '2026-08-26T12:00:00.000Z', sourceOrigin: 'https://apostolicsermonbuilderlseay.netlify.app', deviceLabel: label,
  records: {
    apostolic_sermon_library_v1: JSON.stringify([sermon(notes)]),
    apostolic_lib_subfolders_v1: '{}', counselee_profiles_v1: '{}',
    'ct-revelation-threads-v1': '[]', ct_captured_micdrops_v1: '{}', ct_generated_quotes_v1: '{}',
  },
})
const post = value => ({ httpMethod: 'POST', queryStringParameters: {}, body: JSON.stringify({ export: value }) })

test('device rescue requires an authenticated household session', async () => {
  const handler = createSermonDeviceRescueHandler({ authenticate: async () => null, dataStoreFactory: memoryStore })
  assert.equal((await handler(post(deviceExport()))).statusCode, 401)
})

test('preserves immutable source exports and exact sermon records idempotently', async () => {
  const dataStore = memoryStore()
  const handler = createSermonDeviceRescueHandler({ authenticate: async () => ({ member: 'Larry' }), dataStoreFactory: () => dataStore, now: () => new Date('2026-08-26T13:00:00.000Z') })
  const created = await handler(post(deviceExport()))
  assert.equal(created.statusCode, 201)
  const body = JSON.parse(created.body)
  assert.equal(body.import.counts.sermons, 1)
  assert.equal(body.sermons.length, 1)
  assert.match(body.sermons[0].recordDownload, /fingerprint=/)

  const backup = await handler({ httpMethod: 'GET', queryStringParameters: { checksum: body.import.checksum } })
  assert.equal(backup.statusCode, 200)
  assert.deepEqual(JSON.parse(backup.body), deviceExport())
  const exact = await handler({ httpMethod: 'GET', queryStringParameters: { fingerprint: body.sermons[0].fingerprint } })
  assert.equal(exact.statusCode, 200)
  assert.deepEqual(JSON.parse(exact.body).record, sermon('Original notes'))

  const repeated = await handler(post(deviceExport()))
  assert.equal(repeated.statusCode, 200)
  assert.equal(JSON.parse(repeated.body).idempotent, true)
})

test('keeps both records when devices contain divergent versions of the same legacy sermon', async () => {
  const dataStore = memoryStore()
  const handler = createSermonDeviceRescueHandler({ authenticate: async () => ({ member: 'Larry' }), dataStoreFactory: () => dataStore })
  await handler(post(deviceExport('Lorenzo iPhone', 'Phone notes')))
  const response = await handler(post(deviceExport('Lorenzo iPad', 'iPad notes')))
  const body = JSON.parse(response.body)
  assert.equal(response.statusCode, 201)
  assert.equal(body.sermons.length, 2)
  assert.equal(body.import.conflictRecords, 2)
  assert.ok(body.sermons.every(item => item.conflictGroup))
})

test('records identical content from separately labeled device exports without duplicating the sermon', async () => {
  const dataStore = memoryStore()
  const handler = createSermonDeviceRescueHandler({ authenticate: async () => ({ member: 'Larry' }), dataStoreFactory: () => dataStore })
  await handler(post(deviceExport('Lorenzo iPhone')))
  const response = await handler(post(deviceExport('Lorenzo iPad')))
  const body = JSON.parse(response.body)
  assert.equal(response.statusCode, 201)
  assert.equal(body.imports.length, 2)
  assert.equal(body.sermons.length, 1)
  assert.equal(body.import.duplicateSermons, 1)
  assert.equal(body.sermons[0].sourceExportChecksums.length, 2)
})

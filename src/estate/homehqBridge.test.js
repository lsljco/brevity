import test from 'node:test'
import assert from 'node:assert/strict'
import { auditHomeHQBridge } from '../../netlify/lib/homehq-bridge.mjs'

test('HomeHQ bridge audit reads the synchronized snapshot without returning embedded bytes', async () => {
  const source = [{ id: 'project-1', title: 'Kitchen renovation', type: 'Renovation', photos: ['data:image/png;base64,aGVsbG8='] }]
  const store = {
    async get() {
      return { key: 'homehq_items_v1', value: JSON.stringify(source), hash: 'source-hash', updatedAt: '2026-08-24T10:00:00.000Z', updatedBy: 'Larry' }
    },
  }
  const result = await auditHomeHQBridge({ store, householdId: 'lslj-family', propertyId: 'property-malbec-estate' })
  assert.equal(result.available, true)
  assert.equal(result.manifest.sourceCount, 1)
  assert.equal(result.manifest.attachmentCount, 1)
  assert.equal(result.source.updatedBy, 'Larry')
  assert.equal(JSON.stringify(result).includes('aGVsbG8='), false)
})

test('HomeHQ bridge audit reports an absent snapshot and rejects corrupt JSON', async () => {
  assert.deepEqual(await auditHomeHQBridge({ store: { async get() { return null } }, householdId: 'lslj-family' }), {
    available: false,
    sourceStorageKey: 'homehq_items_v1',
    message: 'No synchronized HomeHQ record is available.',
  })
  await assert.rejects(() => auditHomeHQBridge({
    store: { async get() { return { value: '{broken', updatedAt: '2026-08-24T10:00:00.000Z' } } },
    householdId: 'lslj-family',
  }), /not valid JSON/)
})

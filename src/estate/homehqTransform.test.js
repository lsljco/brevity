import test from 'node:test'
import assert from 'node:assert/strict'
import { readHomeHQExport, transformHomeHQExport } from './homehqTransform.js'

const source = {
  exportedAt: '2026-08-24T09:00:00.000Z',
  records: {
    homehq_items_v1: [
      {
        id: 'basement-1', title: 'Finish basement', type: 'Renovation', room: 'Basement', status: 'In Progress', priority: 'High',
        startDate: '2026-08-01', due: '2026-12-15', estcost: '125,000.00', actcost: '42000',
        cname: 'Chattahoochee Homes', cphone: '(770) 555-0100', cemail: 'build@example.com', bizLicense: true,
        raci: { responsible: ['Larry'], accountable: ['Lorenzo'], consulted: ['Terica'], informed: [] },
        pushToFamilyCalendar: true, notes: 'Framing and systems work', photos: ['data:image/png;base64,aGVsbG8='],
        files: [{ name: 'proposal.pdf', size: 5, type: 'application/pdf', data: 'data:application/pdf;base64,aGVsbG8=' }],
      },
      {
        id: 'repair-1', title: 'Repair stormwater inlet', type: 'Repair', room: 'Yard', status: 'To Do', priority: 'High',
        cname: 'Civil Works LLC', cphone: '7705550101', assignee: 'Larry', due: '2026-09-15',
      },
    ],
  },
}

test('HomeHQ backup reader accepts complete Brevity backups and serialized records', () => {
  assert.equal(readHomeHQExport(source).length, 2)
  assert.equal(readHomeHQExport({ homehq_items_v1: JSON.stringify(source.records.homehq_items_v1) }).length, 2)
  assert.equal(readHomeHQExport(source.records.homehq_items_v1).length, 2)
})

test('HomeHQ transform separates projects, work orders, vendors, and attachment metadata', () => {
  const result = transformHomeHQExport(source)
  assert.deepEqual(result.manifest.counts, { propertyProject: 1, workOrder: 1, vendor: 2, propertyDocument: 2 })
  assert.equal(result.records.propertyProject[0].physicalLocation, 'Basement')
  assert.equal(result.records.propertyProject[0].estimatedCost, 125000)
  assert.equal(result.records.propertyProject[0].raci.accountable[0], 'Lorenzo')
  assert.equal(result.records.workOrder[0].workType, 'repair')
  assert.equal(result.records.workOrder[0].raci.responsible[0], 'Larry')
  assert.equal(result.records.propertyDocument[0].storageStatus, 'pending_object_storage')
  assert.equal(result.records.propertyDocument[0].sourceMetadata.legacyPayload.data, undefined)
  assert.equal(JSON.stringify(result).includes('aGVsbG8='), false)
  assert.equal(result.manifest.attachmentsRequireObjectStorage, true)
  assert.equal(result.manifest.importAllowed, false)
})

test('HomeHQ transform quarantines conflicting contractor copies instead of merging them', () => {
  const conflict = structuredClone(source)
  conflict.records.homehq_items_v1.push({ id: 'repair-2', title: 'Second repair', type: 'Repair', cname: 'Civil Works LLC', cphone: '4045550199' })
  const result = transformHomeHQExport(conflict)
  assert.equal(result.manifest.vendorConflictCount, 1)
  assert.equal(result.records.vendor.some(vendor => vendor.companyName === 'Civil Works LLC'), false)
  assert.equal(result.records.workOrder.filter(order => order.legacyVendorName === 'Civil Works LLC').every(order => !order.vendorId), true)
})

test('HomeHQ transform deduplicates case and phone formatting without fuzzy matching', () => {
  const duplicate = structuredClone(source)
  duplicate.records.homehq_items_v1.push({
    id: 'renovation-2', title: 'Second renovation', type: 'Renovation', cname: 'chattahoochee homes', cphone: '7705550100', cemail: 'BUILD@example.com', bizLicense: true,
  })
  const result = transformHomeHQExport(duplicate)
  assert.equal(result.manifest.vendorConflictCount, 0)
  assert.equal(result.records.vendor.filter(vendor => vendor.id === 'vendor-homehq-chattahoochee-homes').length, 1)
})

test('HomeHQ transform calculates embedded bytes and reports false attachment sizes', () => {
  const mismatch = structuredClone(source)
  mismatch.records.homehq_items_v1[0].files[0].size = 999
  const result = transformHomeHQExport(mismatch)
  const file = result.records.propertyDocument.find(document => document.sourceAttachmentKind === 'file')
  assert.equal(file.byteSize, 5)
  assert.equal(file.sourceDeclaredByteSize, 999)
  assert.equal(result.manifest.attachmentByteMismatches, 1)
  assert.ok(result.manifest.warnings.some(warning => warning.includes('declares 999 bytes')))
})

test('HomeHQ target ids stay stable when mutable record fields change', () => {
  const changed = structuredClone(source)
  changed.records.homehq_items_v1[0].status = 'Done'
  const first = transformHomeHQExport(source)
  const second = transformHomeHQExport(changed)
  assert.equal(first.records.propertyProject[0].id, second.records.propertyProject[0].id)
  assert.notEqual(first.records.propertyProject[0].sourceMetadata.legacyHash, second.records.propertyProject[0].sourceMetadata.legacyHash)
})

test('HomeHQ transform quarantines duplicate ids with different content', () => {
  const duplicateId = structuredClone(source)
  duplicateId.records.homehq_items_v1.push({ id: 'repair-1', title: 'Different repair', type: 'Repair' })
  const result = transformHomeHQExport(duplicateId)
  assert.equal(result.manifest.itemConflictCount, 1)
  assert.equal(result.records.workOrder.some(order => order.sourceMetadata.legacyId === 'repair-1'), false)
  assert.equal(result.itemConflicts[0].copies.length, 2)
})

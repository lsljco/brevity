import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { APOSTOLIC_RECORD_KEYS, inspectApostolicDeviceExport, mergeApostolicSermonIndex } from './sermonLegacyMigration.js'

const sermon = (id, title, notes = 'Complete notes') => ({
  id,
  savedAt: '2026-08-20T10:00:00.000Z',
  dateStr: 'August 20, 2026',
  sermon: { sermon_title: title },
  notes: { body: notes },
  quotes: [{ text: 'Truth' }],
  facebook: { copy: 'Post' },
  infographics: [{ title: 'Visual' }],
})

const deviceExport = (sermons = [sermon('sermon-1', 'Faithful Stewardship')]) => ({
  format: 'apostolic-sermon-device-export',
  schemaVersion: 1,
  exportedAt: '2026-08-26T12:00:00.000Z',
  sourceOrigin: 'https://apostolicsermonbuilderlseay.netlify.app',
  deviceLabel: 'Lorenzo iPhone',
  records: {
    apostolic_sermon_library_v1: JSON.stringify(sermons),
    apostolic_lib_subfolders_v1: JSON.stringify({ teaching: ['sermon-1'] }),
    counselee_profiles_v1: JSON.stringify({ person1: { name: 'Private profile' } }),
    'ct-revelation-threads-v1': JSON.stringify([{ id: 'thread-1' }]),
    ct_captured_micdrops_v1: JSON.stringify({ 'sermon-1': ['Truth'] }),
    ct_generated_quotes_v1: JSON.stringify({ 'sermon-1': ['Quote'] }),
  },
})

test('inspects every meaningful Apostolic local record without discarding rich sermon content', () => {
  const inspection = inspectApostolicDeviceExport(deviceExport())
  assert.equal(inspection.valid, true)
  assert.deepEqual(inspection.counts, { sermons: 1, folders: 1, counselingProfiles: 1, revelationThreads: 1, capturedMicDropGroups: 1, generatedQuoteGroups: 1 })
  assert.equal(inspection.sermons[0].title, 'Faithful Stewardship')
  assert.equal(inspection.sermons[0].hasNotes, true)
  assert.equal(inspection.sermons[0].hasFacebookDraft, true)
  assert.deepEqual(inspection.sermons[0].record, sermon('sermon-1', 'Faithful Stewardship'))
})

test('rejects unrelated JSON instead of treating it as a rescue package', () => {
  const inspection = inspectApostolicDeviceExport({ records: { something: '[]' } })
  assert.equal(inspection.valid, false)
  assert.match(inspection.issues.join(' '), /not an Apostolic Sermon Builder device rescue package/i)
})

test('merges exact records idempotently and preserves divergent device versions as conflicts', () => {
  const first = inspectApostolicDeviceExport(deviceExport()).sermons
  const initial = mergeApostolicSermonIndex([], first, 'device-one')
  const duplicate = mergeApostolicSermonIndex(initial.entries, first, 'device-two')
  assert.equal(duplicate.entries.length, 1)
  assert.equal(duplicate.duplicate, 1)
  assert.deepEqual(duplicate.entries[0].sourceExportChecksums, ['device-one', 'device-two'])

  const changed = inspectApostolicDeviceExport(deviceExport([sermon('sermon-1', 'Faithful Stewardship', 'Different device notes')])).sermons
  const conflict = mergeApostolicSermonIndex(duplicate.entries, changed, 'device-three')
  assert.equal(conflict.entries.length, 2)
  assert.equal(conflict.conflicts, 2)
  assert.ok(conflict.entries.every(entry => entry.conflictGroup))
})

test('browser rescue script reads all recognized keys and contains no destructive storage operation', async () => {
  const source = await readFile(new URL('../../public/apostolic-device-rescue.js', import.meta.url), 'utf8')
  APOSTOLIC_RECORD_KEYS.forEach(key => assert.match(source, new RegExp(key.replaceAll('-', '\\-'))))
  assert.doesNotMatch(source, /localStorage\.(?:clear|removeItem|setItem)\s*\(/)
})


import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { inspectApostolicDeviceExport, mergeApostolicSermonIndex } from '../../src/household/sermonLegacyMigration.js'

const { readSession } = householdAuth
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-sermon-repository'
const importsKey = `${HOUSEHOLD_ID}/apostolic-device-imports/index`
const sermonIndexKey = `${HOUSEHOLD_ID}/apostolic-device-imports/sermons`
const exportKey = checksum => `${HOUSEHOLD_ID}/apostolic-device-imports/exports/${checksum}`
const sermonKey = fingerprint => `${HOUSEHOLD_ID}/apostolic-device-imports/records/${fingerprint}`
const clean = (value, length = 180) => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, length)
const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) })
const store = () => getStore({ name: STORE_NAME, consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_TOKEN })
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]))
  return value
}
const checksumFor = deviceExport => createHash('sha256').update(JSON.stringify(canonicalize(deviceExport))).digest('hex')

export function createSermonDeviceRescueHandler({ authenticate = readSession, dataStoreFactory = store, now = () => new Date() } = {}) {
  return async event => {
    try {
      const session = await authenticate(event)
      if (!session) return json(401, { error: 'Sign in to preserve Apostolic Sermon Builder records.' })
      const dataStore = dataStoreFactory()
      if (event.httpMethod === 'GET') {
        const fingerprint = clean(event.queryStringParameters?.fingerprint, 80)
        if (fingerprint) {
          const record = await dataStore.get(sermonKey(fingerprint), { type: 'json' }).catch(() => null)
          if (!record) return json(404, { error: 'That recovered sermon record was not found.' })
          return {
            statusCode: 200,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'content-disposition': `attachment; filename="apostolic-recovered-sermon-${fingerprint}.json"`,
              'cache-control': 'private, no-store',
            },
            body: JSON.stringify({ format: 'apostolic-recovered-sermon', schemaVersion: 1, record }, null, 2),
          }
        }
        const checksum = clean(event.queryStringParameters?.checksum, 64)
        if (checksum) {
          const backup = await dataStore.get(exportKey(checksum), { type: 'json' }).catch(() => null)
          if (!backup) return json(404, { error: 'That device rescue package was not found.' })
          return { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="apostolic-device-rescue-${checksum.slice(0, 12)}.json"`, 'cache-control': 'private, no-store' }, body: JSON.stringify(backup, null, 2) }
        }
        const [imports, sermons] = await Promise.all([
          dataStore.get(importsKey, { type: 'json' }).catch(() => []),
          dataStore.get(sermonIndexKey, { type: 'json' }).catch(() => []),
        ])
        return json(200, { imports: Array.isArray(imports) ? imports : [], sermons: Array.isArray(sermons) ? sermons : [] })
      }
      if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })
      if (Buffer.byteLength(event.body || '', 'utf8') > 5_500_000) return json(413, { error: 'This device rescue package exceeds the 5.5 MB safe import limit.' })
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid JSON request.' }) }
      const inspection = inspectApostolicDeviceExport(body.export)
      if (!inspection.valid) return json(400, { error: inspection.issues.join(' ') })
      const sourceChecksum = checksumFor(body.export)
      const existingImports = await dataStore.get(importsKey, { type: 'json' }).catch(() => [])
      const duplicateImport = (Array.isArray(existingImports) ? existingImports : []).find(item => item.checksum === sourceChecksum)
      if (duplicateImport) {
        const sermons = await dataStore.get(sermonIndexKey, { type: 'json' }).catch(() => [])
        return json(200, { idempotent: true, import: duplicateImport, imports: existingImports, sermons: Array.isArray(sermons) ? sermons : [] })
      }
      const importedAt = now().toISOString()
      const priorSermons = await dataStore.get(sermonIndexKey, { type: 'json' }).catch(() => [])
      const merged = mergeApostolicSermonIndex(Array.isArray(priorSermons) ? priorSermons : [], inspection.sermons, sourceChecksum)
      merged.entries = merged.entries.map(entry => ({
        ...entry,
        recordDownload: `/.netlify/functions/sermon-device-rescue?fingerprint=${entry.fingerprint}`,
      }))
      const importRecord = {
        id: `apostolic-device-import-${sourceChecksum.slice(0, 20)}`,
        checksum: sourceChecksum,
        deviceLabel: inspection.source.deviceLabel,
        sourceExportedAt: inspection.source.exportedAt,
        sourceOrigin: inspection.source.sourceOrigin,
        importedAt,
        importedBy: session.member,
        counts: inspection.counts,
        importedSermons: merged.imported,
        duplicateSermons: merged.duplicate,
        conflictRecords: merged.conflicts,
        backupDownload: `/.netlify/functions/sermon-device-rescue?checksum=${sourceChecksum}`,
      }
      await Promise.all([
        dataStore.setJSON(exportKey(sourceChecksum), body.export),
        ...inspection.sermons.map(item => dataStore.setJSON(sermonKey(item.fingerprint), item.record)),
      ])
      const imports = [importRecord, ...(Array.isArray(existingImports) ? existingImports : [])].slice(0, 100)
      await Promise.all([dataStore.setJSON(sermonIndexKey, merged.entries), dataStore.setJSON(importsKey, imports)])
      return json(201, { idempotent: false, import: importRecord, imports, sermons: merged.entries })
    } catch (error) {
      console.error('[sermon-device-rescue]', error)
      return json(500, { error: error.message || 'Apostolic device records could not be preserved.' })
    }
  }
}

export const handler = createSermonDeviceRescueHandler()

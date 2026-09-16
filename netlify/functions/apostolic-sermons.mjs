import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'

const { readSession } = householdAuth
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-sermon-repository'
const MAX_BODY_BYTES = 5_500_000
const jsonHeaders = { 'content-type':'application/json; charset=utf-8', 'cache-control':'private, no-store' }
const json = (statusCode, body) => ({ statusCode, headers:jsonHeaders, body:JSON.stringify(body) })
const store = () => getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
const memberSlug = member => String(member || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)
const libraryKey = member => `${HOUSEHOLD_ID}/apostolic-members/${memberSlug(member)}/library`
const rescueImportsKey = `${HOUSEHOLD_ID}/apostolic-device-imports/index`
const rescueIndexKey = `${HOUSEHOLD_ID}/apostolic-device-imports/sermons`
const rescueRecordKey = fingerprint => `${HOUSEHOLD_ID}/apostolic-device-imports/records/${fingerprint}`
const validRecords = value => Array.isArray(value) ? value.filter(record => record && typeof record === 'object' && !Array.isArray(record)).slice(0,1000) : []
const validSubfolders = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

async function seedMemberFromDeviceRescues(dataStore, member, now) {
  const [index,imports] = await Promise.all([
    dataStore.get(rescueIndexKey, { type:'json' }).catch(() => []),
    dataStore.get(rescueImportsKey, { type:'json' }).catch(() => []),
  ])
  if (!Array.isArray(index) || !index.length) return null
  const memberImports = (Array.isArray(imports) ? imports : []).filter(item => memberSlug(item.importedBy) === memberSlug(member))
  const memberChecksums = new Set(memberImports.map(item => item.checksum).filter(Boolean))
  let eligible = index.filter(entry => (entry.sourceExportChecksums || []).some(checksum => memberChecksums.has(checksum)))
  // Rescue packages created before member libraries existed belonged to Lorenzo's
  // standalone builder and may have been uploaded administratively for him.
  if (!eligible.length && memberSlug(member) === 'lorenzo') eligible = index
  if (!eligible.length) return null
  const recovered = await Promise.all(eligible.slice(0,1000).map(entry => dataStore.get(rescueRecordKey(entry.fingerprint), { type:'json' }).catch(() => null)))
  const records = recovered.filter(record => record && typeof record === 'object' && !Array.isArray(record))
  if (!records.length) return null
  return { schemaVersion:1, revision:1, member, records, subfolders:{}, updatedAt:now().toISOString(), migratedFromDeviceRescue:true }
}

export function createApostolicSermonsHandler({ authenticate=readSession, dataStoreFactory=store, now=()=>new Date() }={}) {
  return async event => {
    try {
      const session = await authenticate(event)
      if (!session?.member) return json(401,{ error:'Sign in to synchronize the Apostolic Sermon Builder.' })
      const dataStore = dataStoreFactory()
      const key = libraryKey(session.member)
      if (event.httpMethod === 'GET') {
        let library = await dataStore.get(key,{ type:'json' }).catch(() => null)
        if (!library) {
          library = await seedMemberFromDeviceRescues(dataStore,session.member,now)
          if (library) await dataStore.setJSON(key,library)
        }
        return json(200,library || { schemaVersion:1, revision:0, member:session.member, records:[], subfolders:{}, updatedAt:null })
      }
      if (event.httpMethod !== 'PUT') return json(405,{ error:'Method not allowed.' })
      if (Buffer.byteLength(event.body || '', 'utf8') > MAX_BODY_BYTES) return json(413,{ error:'This sermon library is too large to synchronize in one request.' })
      let body
      try { body=JSON.parse(event.body || '{}') } catch { return json(400,{ error:'Invalid sermon-library data.' }) }
      const current = await dataStore.get(key,{ type:'json' }).catch(() => null)
      const currentRevision = Number(current?.revision || 0)
      const baseRevision = Number(body.baseRevision || 0)
      if (currentRevision !== baseRevision) return json(409,{ error:'A newer sermon-library version is available.', library:current })
      const library = {
        schemaVersion:1,
        revision:currentRevision+1,
        member:session.member,
        records:validRecords(body.records),
        subfolders:validSubfolders(body.subfolders),
        updatedAt:now().toISOString(),
        updatedBy:session.member,
      }
      await dataStore.setJSON(key,library)
      return json(200,library)
    } catch(error) {
      console.error('[apostolic-sermons]',error)
      return json(500,{ error:'Brevity could not synchronize the Apostolic sermon library.' })
    }
  }
}

export const handler = createApostolicSermonsHandler()

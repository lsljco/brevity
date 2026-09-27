import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'

const { readSession } = householdAuth
const householdId = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const key = `${householdId}/ministry/sermon-workspace/v1`
const store = () => getStore({ name:'brevity-sermon-repository', consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
const reply = (statusCode, body) => ({ statusCode, headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}, body:JSON.stringify(body) })
const empty = { schemaVersion:1, revision:0, series:[], sermons:[] }
const validId = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value || '')

function validate(body) {
  if (!Array.isArray(body.series) || !Array.isArray(body.sermons) || body.series.length>200 || body.sermons.length>1000) return false
  const seriesIds = new Set(), sermonIds = new Set()
  for (const item of body.series) {
    if (!validId(item?.id) || seriesIds.has(item.id) || typeof item.title !== 'string' || item.title.length>200) return false
    seriesIds.add(item.id)
  }
  for (const item of body.sermons) {
    if (!validId(item?.id) || sermonIds.has(item.id) || (item.seriesId && !seriesIds.has(item.seriesId)) || typeof item.title !== 'string' || item.title.length>200 || !Array.isArray(item.assets) || item.assets.length>100) return false
    sermonIds.add(item.id)
    if (item.assets.some(asset => !validId(asset?.id) || typeof asset.content !== 'string' || asset.content.length>50000)) return false
  }
  return true
}

export function createMinistrySermonWorkspaceHandler({ authenticate=readSession, dataStoreFactory=store, now=()=>new Date() }={}) {
  return async event => {
    try {
      const session = await authenticate(event)
      if (!session?.member) return reply(401,{error:'Sign in to use the sermon workspace.'})
      const dataStore = dataStoreFactory()
      if (event.httpMethod==='GET') return reply(200,(await dataStore.get(key,{type:'json'})) || empty)
      if (event.httpMethod!=='PUT') return reply(405,{error:'Method not allowed.'})
      if (Buffer.byteLength(event.body || '', 'utf8')>4_000_000) return reply(413,{error:'The workspace exceeds its 4 MB limit. Keep recordings in linked storage.'})
      let body
      try { body=JSON.parse(event.body || '{}') } catch { return reply(400,{error:'Invalid workspace data.'}) }
      if (!validate(body)) return reply(400,{error:'Invalid series or sermon data.'})
      const current=(await dataStore.get(key,{type:'json'})) || empty
      if (body.baseRevision !== current.revision) return reply(409,{error:'Another member saved a newer version. Reload to review it before saving.',workspace:current})
      const updated={ schemaVersion:1, revision:current.revision+1, series:body.series, sermons:body.sermons, updatedAt:now().toISOString(), updatedBy:session.member }
      await dataStore.setJSON(key,updated)
      return reply(200,updated)
    } catch(error) {
      console.error('[ministry-sermon-workspace]',error)
      return reply(500,{error:'Could not load or save the sermon workspace.'})
    }
  }
}

export const handler=createMinistrySermonWorkspaceHandler()

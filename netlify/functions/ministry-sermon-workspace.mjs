import { getStore } from '../lib/scoped-store.cjs'
import householdAuth from './household-auth.js'
import { importSermonFields, importedWorkspaceSermon } from '../lib/sermon-workspace-import.mjs'

const { readSession } = householdAuth
const householdId = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const key = `${householdId}/ministry/sermon-workspace/v1`
const store = () => getStore({ name:'brevity-sermon-repository', consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
const reply = (statusCode, body) => ({ statusCode, headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}, body:JSON.stringify(body) })
const empty = { schemaVersion:1, revision:0, series:[], sermons:[] }
const validId = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value || '')
const memberSlug = member => String(member||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)
const vaultKey = member => `${householdId}/apostolic-members/${memberSlug(member)}/library`
const newId = () => globalThis.crypto.randomUUID()

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

export function createMinistrySermonWorkspaceHandler({ authenticate=readSession, dataStoreFactory=store, now=()=>new Date(), idFactory=newId }={}) {
  return async event => {
    try {
      const session = await authenticate(event)
      if (!session?.member) return reply(401,{error:'Sign in to use the sermon workspace.'})
      const dataStore = dataStoreFactory()
      const vaultMember = String(event.queryStringParameters?.member||session.member)
      if (event.httpMethod==='GET' && event.queryStringParameters?.source==='vault') {
        if(vaultMember!==session.member&&session.role!=='admin')return reply(403,{error:'This Vault belongs to another member.'})
        const vault=await dataStore.get(vaultKey(vaultMember),{type:'json'}).catch(()=>null)
        const records=(vault?.records||[]).filter(record=>record?.sermon)
        if(event.queryStringParameters?.recordId){const selected=records.find(record=>record.id===event.queryStringParameters.recordId);return selected?reply(200,{record:selected}):reply(404,{error:'That Vault sermon was not found.'})}
        return reply(200,{records:records.map(record=>({id:record.id,title:record.sermon.sermon_title||'Untitled',series:record.sermon.series||'',savedAt:record.savedAt||'',preview:record.sermon.big_idea||''}))})
      }
      if (event.httpMethod==='GET') return reply(200,(await dataStore.get(key,{type:'json'})) || empty)
      if (!['PUT','POST'].includes(event.httpMethod)) return reply(405,{error:'Method not allowed.'})
      if (Buffer.byteLength(event.body || '', 'utf8')>4_000_000) return reply(413,{error:'The workspace exceeds its 4 MB limit. Keep recordings in linked storage.'})
      let body
      try { body=JSON.parse(event.body || '{}') } catch { return reply(400,{error:'Invalid workspace data.'}) }
      if (event.httpMethod==='POST') {
        const current=(await dataStore.get(key,{type:'json'})) || empty
        if (body.baseRevision!==current.revision) return reply(409,{error:'The workspace changed. Refresh and review the import before trying again.',workspace:current})
        let record=null,sourceKey=''
        if(body.source==='vault') {
          if(!validId(body.recordId))return reply(400,{error:'Select a valid Vault sermon.'})
          const sourceMember=String(body.vaultMember||session.member)
          if(sourceMember!==session.member&&session.role!=='admin')return reply(403,{error:'This Vault belongs to another member.'})
          const vault=await dataStore.get(vaultKey(sourceMember),{type:'json'}).catch(()=>null)
          record=(vault?.records||[]).find(item=>item.id===body.recordId&&item.sermon)
          if(!record)return reply(404,{error:'That sermon is not in your synchronized Apostolic Builder Vault. Open the Builder to synchronize it, then try again.'})
          sourceKey=`apostolic:${memberSlug(sourceMember)}:${record.id}`
          const existing=current.sermons.find(item=>item.sourceKey===sourceKey)
          if(existing)return reply(200,{workspace:current,sermonId:existing.id,alreadyImported:true})
        } else if(!['paste','file'].includes(body.source)) return reply(400,{error:'Choose a Vault sermon, device file, or pasted text.'})
        let fields
        try { fields=importSermonFields({sermon:record?.sermon||body.sermon,notes:record?.notes||body.notes,rawText:body.rawText,sourceName:body.source==='vault'?'Apostolic Builder Vault':body.sourceName||body.source}) }
        catch(error){return reply(400,{error:error.message})}
        if(fields.outline.length>150000||fields.sourceNotes.length>150000)return reply(413,{error:'This sermon exceeds the import text limit.'})
        const seriesTitle=fields.seriesTitle
        let seriesId=current.series.find(item=>item.title.trim().toLowerCase()===seriesTitle.toLowerCase())?.id||''
        const series=[...current.series]
        if(seriesTitle&&!seriesId){seriesId=idFactory();series.push({id:seriesId,title:seriesTitle,description:'',createdAt:now().toISOString()})}
        const sermonId=idFactory()
        const sermon=importedWorkspaceSermon({fields,sourceKey,member:session.member,seriesId,id:sermonId,now:now()})
        const updated={schemaVersion:1,revision:current.revision+1,series,sermons:[sermon,...current.sermons],updatedAt:now().toISOString(),updatedBy:session.member}
        if(!validate(updated))return reply(400,{error:'The imported sermon could not be saved. Shorten the title or manuscript and retry.'})
        await dataStore.setJSON(key,updated)
        return reply(200,{workspace:updated,sermonId})
      }
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

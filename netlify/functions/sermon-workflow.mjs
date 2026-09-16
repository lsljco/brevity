import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { sermonFormationPermission } from './sermon-formation-start.mjs'
import { buildTimesSermonDocx, buildTimesSermonPdf, sermonGuideBaseName } from '../lib/sermon-times-documents.mjs'
import { productionAssistantActionRepository } from '../lib/assistant-action-repository.mjs'
import { productionSermonSourceRepository, requireReviewedActiveSermon, sermonArtifactId } from '../lib/sermon-source-repository.mjs'
import { startSermonWorkflow, updateSermonWorkflow } from '../lib/sermon-workflow-state.mjs'

const { readSession } = householdAuth
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-sermon-repository'
const indexKey = `${HOUSEHOLD_ID}/sermons/index`
const fileKey = (id, format) => `${HOUSEHOLD_ID}/sermons/${id}/sermon.${format}`
const clean = value => String(value || '').trim()
const json = (statusCode, body) => ({ statusCode, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }, body:JSON.stringify(body) })

async function updateIndex(dataStore, entry) {
  for (let attempt=0; attempt<5; attempt+=1) {
    const current = await dataStore.getWithMetadata(indexKey, { type:'json' }).catch(error => error?.status === 404 || error?.statusCode === 404 || error?.name === 'NotFoundError' ? null : Promise.reject(error))
    if (current && !current.etag) throw Object.assign(new Error('The sermon repository index did not include a safe version marker.'), { code:'VERSION_CONFLICT' })
    const prior = Array.isArray(current?.data) ? current.data : []
    const entries = [entry, ...prior.filter(item => item.id !== entry.id)].slice(0, 200)
    const result = await dataStore.setJSON(indexKey, entries, current ? { onlyIfMatch:current.etag } : { onlyIfNew:true })
    if (result?.modified !== false) return entries
  }
  throw Object.assign(new Error('The sermon repository changed while documents were being indexed. Retry after refreshing.'), { code:'VERSION_CONFLICT' })
}

export function createSermonWorkflowHandler({
  readSessionFn = readSession,
  sourceRepository = null,
  actionRepository = null,
  documentStore = null,
  buildDocx = buildTimesSermonDocx,
  buildPdf = buildTimesSermonPdf,
  workflowStart = startSermonWorkflow,
  workflowUpdate = updateSermonWorkflow,
  now = () => new Date(),
} = {}) {
  return async event => {
    if (event.httpMethod !== 'POST') return json(405, { error:'Method not allowed.' })
    const session = await readSessionFn(event).catch(() => null)
    if (!session) return json(401, { error:'Sign in to create sermon artifacts.' })
    const actions = actionRepository || productionAssistantActionRepository()
    const permission = sermonFormationPermission({ session, permissions:(await actions.getPermissions())?.[session.member] })
    if (!permission.allowed) return json(403, { error:permission.reason })
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error:'Invalid request body.' }) }
    const activeVersion = Number(body.activeVersion), sourceHash = String(body.sourceHash || '')
    const sources = sourceRepository || productionSermonSourceRepository()
    let active
    try { active = await requireReviewedActiveSermon({ repository:sources, expectedVersion:activeVersion, sourceHash }) }
    catch (error) { return json(409, { error:error.message }) }
    const notes = active.sermonNotes, source = active.source || {}, title = clean(notes.documentTitle || notes.title || source.title)
    if (!title) return json(422, { error:'The reviewed active sermon needs a title before documents can be created.' })
    const sermonDate = clean(source.sermonDate || notes.sermonDate) || now().toISOString().slice(0, 10)
    const id = sermonArtifactId({ sermonDate, title, sourceHash, activeVersion })
    const baseName = sermonGuideBaseName(title, sermonDate), pdfOnly = source.sourceKind === 'notes'
    await workflowStart(id, { title, sermonDate, member:session.member, sourceKind:source.sourceKind || 'transcript', sourceHash, activeVersion })
    await workflowUpdate(id, 'notes', 'complete', { sourceKind:source.sourceKind || 'transcript', reviewedActive:true, sourceHash, activeVersion })
    try {
      await workflowUpdate(id, 'documents', 'running')
      const [docx,pdf] = await Promise.all([pdfOnly ? Promise.resolve(null) : buildDocx(notes, source), buildPdf(notes, source)])
      const dataStore = documentStore || getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
      await Promise.all([dataStore.set(fileKey(id, 'pdf'), pdf), docx ? dataStore.set(fileKey(id, 'docx'), docx) : Promise.resolve()])
      await workflowUpdate(id, 'documents', 'complete', { pdf:true, docx:!pdfOnly, sourceHash, activeVersion })
      await workflowUpdate(id, 'documentPublishing', 'skipped', { state:'disabled', reason:'External publishing requires a separate reviewed, reversible workflow.' })
      const files = { pdf:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=pdf`, ...(pdfOnly ? {} : { docx:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=docx` }) }
      const entry = {
        id,title,baseName,sourceHash,activeVersion,
        fileNames:{ pdf:`${baseName}.pdf`, ...(pdfOnly ? {} : { docx:`${baseName}.docx` }) },
        sermonDate,serviceType:clean(source.serviceType),preacherTeacher:clean(notes.preacherTeacher),
        sourceKind:source.sourceKind || 'transcript',updatedAt:now().toISOString(),updatedBy:session.member,files,
        oneDrive:{ state:'disabled', reason:'External publishing is disabled until it can be reviewed and safely restored.' },
      }
      await updateIndex(dataStore, entry)
      return json(200, { document:entry, assets:{ state:'not-started' }, workflowId:id })
    } catch (error) {
      console.error('[sermon-workflow]', error)
      await workflowUpdate(id, 'documents', 'error', { error:error.message || 'Brevity could not create the sermon documents.' }).catch(() => {})
      const status = error.code === 'VERSION_CONFLICT' ? 409 : 500
      return json(status, { error:error.message || 'Brevity could not create the sermon documents.', workflowId:id })
    }
  }
}

export const handler = createSermonWorkflowHandler()

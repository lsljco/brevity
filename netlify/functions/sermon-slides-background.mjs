import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { sermonFormationPermission } from './sermon-formation-start.mjs'
import { buildSermonSlides, sermonSlidesFileName } from '../lib/sermon-slides.mjs'
import { buildSevenDayDevotionsPdf } from '../lib/devotion-document.mjs'
import { productionAssistantActionRepository } from '../lib/assistant-action-repository.mjs'
import { productionSermonSourceRepository, requireReviewedActiveSermon, sermonArtifactId } from '../lib/sermon-source-repository.mjs'
import { markSermonWorkflowComplete, readSermonWorkflow, updateSermonWorkflow } from '../lib/sermon-workflow-state.mjs'

const { readSession } = householdAuth
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-sermon-slides'
const PUBLISHING_POLICY = 'External publishing requires a reviewed, reversible workflow.'
const statusKey = id => `${HOUSEHOLD_ID}/slides/${id}/status`
const fileKey = id => `${HOUSEHOLD_ID}/slides/${id}/deck.pptx`
const devotionsFileKey = id => `${HOUSEHOLD_ID}/slides/${id}/devotions.pdf`
const assetKey = (id,index,kind='slides') => `${HOUSEHOLD_ID}/slides/${id}/${kind}/${String(index).padStart(2,'0')}.png`
const json = (status, body) => new Response(JSON.stringify(body), { status, headers:{ 'content-type':'application/json' } })

export function createSermonSlidesBackgroundHandler({
  readSessionFn = readSession,
  sourceRepository = null,
  actionRepository = null,
  slideStore = null,
  buildSlides = buildSermonSlides,
  buildDevotions = buildSevenDayDevotionsPdf,
  workflowRead = readSermonWorkflow,
  workflowUpdate = updateSermonWorkflow,
  workflowComplete = markSermonWorkflowComplete,
  now = () => new Date(),
} = {}) {
  return async request => {
    const session = await readSessionFn({ headers:{ cookie:request.headers.get('cookie') || '' } }).catch(() => null)
    if (!session) return json(401, { error:'Sign in to create sermon slides.' })
    const actions = actionRepository || productionAssistantActionRepository()
    const permission = sermonFormationPermission({ session, permissions:(await actions.getPermissions())?.[session.member] })
    if (!permission.allowed) return json(403, { error:permission.reason })
    const body = await request.json().catch(() => ({})), activeVersion = Number(body.activeVersion), sourceHash = String(body.sourceHash || '')
    const sources = sourceRepository || productionSermonSourceRepository()
    let active
    try { active = await requireReviewedActiveSermon({ repository:sources, expectedVersion:activeVersion, sourceHash }) }
    catch (error) { return json(409, { error:error.message }) }
    const notes = active.sermonNotes, source = active.source || {}, title = notes.documentTitle || notes.title || source.title || 'Sermon'
    const id = sermonArtifactId({ sermonDate:source.sermonDate || notes.sermonDate, title, sourceHash, activeVersion })
    if (body.id !== id) return json(409, { error:'The slide request does not match the exact reviewed active-sermon artifact. Save the current documents and try again.' })
    const dataStore = slideStore || getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
    const prior = await dataStore.get(statusKey(id), { type:'json' }).catch(() => null)
    if (prior?.state === 'generating' || (prior?.state === 'ready' && prior?.devotions?.state === 'ready' && prior?.devotionsDownload)) return json(202, { accepted:true, recovered:true, id, state:prior.state })
    const fileName = sermonSlidesFileName(notes, source)
    await dataStore.setJSON(statusKey(id), { state:'generating',completed:0,total:0,fileName,sourceHash,activeVersion,startedAt:now().toISOString(),upgradingLegacyPackage:prior?.state==='ready',publishingPolicy:PUBLISHING_POLICY })
    try {
      const result = await buildSlides(notes, source, progress => dataStore.setJSON(statusKey(id), { state:'generating',...progress,fileName,sourceHash,activeVersion,updatedAt:now().toISOString(),publishingPolicy:PUBLISHING_POLICY }))
      const devotionsPdf = await buildDevotions(notes, source, { assets:result.devotionAssets })
      await dataStore.set(fileKey(id), result.buffer)
      await dataStore.set(devotionsFileKey(id), devotionsPdf)
      await Promise.all([
        ...result.assets.map(asset => dataStore.set(assetKey(id, asset.index), asset.buffer)),
        ...result.devotionAssets.map(asset => dataStore.set(assetKey(id, asset.index, 'devotions'), asset.buffer)),
      ])
      await workflowUpdate(id, 'slides', 'complete', { slideCount:result.slideCount, publishing:'disabled', sourceHash, activeVersion })
      await workflowUpdate(id, 'visuals', 'complete', { visualCount:result.assets.length + result.devotionAssets.length, publishing:'disabled', sourceHash, activeVersion })
      await workflowUpdate(id, 'devotions', 'complete', { devotionCount:result.devotionAssets.length, publishing:'disabled', sourceHash, activeVersion })
      const workflow = await workflowRead(id)
      if (!Object.values(workflow?.stages || {}).some(stage => stage?.state === 'error')) await workflowComplete(id)
      const devotionImages = result.devotionAssets.map(asset => `/.netlify/functions/sermon-slides?id=${encodeURIComponent(id)}&asset=devotion&index=${asset.index}`)
      await dataStore.setJSON(statusKey(id), {
        state:'ready',slideCount:result.slideCount,completed:result.slideCount + result.devotionAssets.length,total:result.slideCount + result.devotionAssets.length,
        fileName,sourceHash,activeVersion,oneDrive:{state:'disabled'},visuals:{state:'ready'},devotions:{state:'ready',count:result.devotionAssets.length},
        devotionCount:result.devotionAssets.length,devotionImages,devotionsDownload:`/.netlify/functions/sermon-slides?id=${encodeURIComponent(id)}&asset=devotions`,
        visualCount:result.assets.length + result.devotionAssets.length,updatedAt:now().toISOString(),publishingPolicy:PUBLISHING_POLICY,
        download:`/.netlify/functions/sermon-slides?id=${encodeURIComponent(id)}&download=1`,
      })
    } catch (error) {
      console.error('[sermon-slides-background]', error)
      for (const stage of ['slides','visuals','devotions']) await workflowUpdate(id, stage, 'error', { error:error.message || 'Brevity could not create the sermon slides and devotions.' }).catch(() => {})
      await dataStore.setJSON(statusKey(id), { state:'error',error:error.message || 'Brevity could not create the sermon slides and devotions.',fileName,sourceHash,activeVersion,updatedAt:now().toISOString(),publishingPolicy:PUBLISHING_POLICY })
    }
    return json(202, { accepted:true, id })
  }
}

export default createSermonSlidesBackgroundHandler()
export const config = { background:true, path:'/.netlify/functions/sermon-slides-background' }

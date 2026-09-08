import householdAuth from './household-auth.js'
import { productionAssistantActionRepository } from '../lib/assistant-action-repository.mjs'
import { productionSermonSourceRepository, sermonSourceHash } from '../lib/sermon-source-repository.mjs'

const { readSession } = householdAuth
const MAX_TRANSCRIPT_LENGTH = 600000
const json = (statusCode, body) => ({ statusCode, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }, body:JSON.stringify(body) })
const clean = (value, max = 500) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const validJobId = value => /^sermon-[a-f0-9]{40}-v\d+-[a-z0-9_-]{1,80}$/.test(String(value || ''))

export function sermonFormationPermission({ session, permissions }) {
  if (session?.role === 'admin') return { allowed:true }
  if (permissions?.planning) return { allowed:true }
  return { allowed:false, reason:`Plans & decisions access is required for ${session?.member || 'this member'} to prepare a sermon-source change.` }
}

const backgroundUrl = event => {
  const host = String(event.headers?.['x-forwarded-host'] || event.headers?.host || 'brevityoflife.netlify.app').split(',')[0].trim()
  const proto = String(event.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim()
  return `${proto}://${host}/.netlify/functions/sermon-formation-background`
}

export function createSermonFormationStartHandler({
  sourceRepository = null,
  actionRepository = null,
  readSessionFn = readSession,
  fetchFn = fetch,
} = {}) {
  return async event => {
    const sources = sourceRepository || productionSermonSourceRepository()
    const actions = actionRepository || productionAssistantActionRepository()
    if (event.httpMethod !== 'POST') return json(405, { error:'Method not allowed.' })
    const session = await readSessionFn(event).catch(() => null)
    if (!session) return json(401, { error:'Sign in to analyze a sermon source.' })
    const matrix = await actions.getPermissions()
    const permission = sermonFormationPermission({ session, permissions:matrix?.[session.member] })
    if (!permission.allowed) return json(403, { error:permission.reason })
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error:'Invalid request body.' }) }
    const queue = async job => {
      const dispatch = await sources.markJobQueued(job.id, session.member)
      if (!dispatch.dispatch) return true
      const response = await fetchFn(backgroundUrl(event), {
        method:'POST',
        headers:{ 'content-type':'application/json', cookie:event.headers?.cookie || event.headers?.Cookie || '' },
        body:JSON.stringify({ jobId:job.id }),
      })
      if (!response.ok && response.status !== 202) {
        await sources.failJob(job.id, session.member, `Brevity could not queue sermon analysis (${response.status}).`)
        return false
      }
      return true
    }
    if (body.jobId) {
      if (!validJobId(body.jobId)) return json(400, { error:'A valid sermon-analysis job is required.' })
      const recovered = await sources.requeueJob(String(body.jobId), session.member, { restart:body.restart === true })
      if (recovered.job?.state === 'ready') return json(200, { accepted:false, recovered:true, jobId:recovered.job.id, state:'ready' })
      if (!recovered.shouldQueue) {
        const state = recovered.status?.state || recovered.job?.state || 'processing'
        if (recovered.terminal || ['error', 'timeout'].includes(state)) {
          return json(409, { error:recovered.status?.reason || recovered.job?.error || 'This retained sermon analysis needs an explicit retry.', jobId:recovered.job?.id, state, retryable:Boolean(recovered.job?.request) })
        }
        return json(202, { accepted:true, recovered:true, jobId:recovered.job.id, state })
      }
      if (!await queue(recovered.job)) return json(502, { error:'Brevity could not resume sermon analysis. The active sermon was not changed.', jobId:recovered.job.id })
      return json(202, { accepted:true, recovered:true, jobId:recovered.job.id, state:'pending' })
    }
    const transcript = String(body.transcript || '').trim()
    if (!transcript) return json(400, { error:'A sermon transcript or existing sermon-notes document is required.' })
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) return json(413, { error:'This sermon source exceeds Brevity’s 600,000-character capacity.' })
    const request = {
      transcript,
      sermonDate:clean(body.sermonDate, 20),
      serviceType:clean(body.serviceType, 80),
      title:clean(body.title, 300),
      targetDate:clean(body.targetDate, 20),
      sourceKind:body.sourceKind === 'notes' ? 'notes' : 'transcript',
    }
    const sourceHash = sermonSourceHash(transcript)
    const active = await sources.active()
    const created = await sources.createJob({
      member:session.member,
      request,
      sourceHash,
      baseActiveVersion:active.version,
      baseActiveSourceHash:active.value?.source?.sourceHash || '',
    })
    const job = created.job
    if (job.state === 'ready') return json(200, { accepted:false, recovered:true, jobId:job.id, draftId:job.draftId, sourceHash, baseActiveVersion:job.baseActiveVersion })
    if (job.state === 'error') return json(409, { error:job.error || 'This sermon analysis needs attention before it can be retried.', jobId:job.id })
    if (created.shouldQueue) {
      if (!await queue(job)) return json(502, { error:'Brevity could not queue sermon analysis. The active sermon was not changed.', jobId:job.id })
    }
    return json(202, { accepted:true, jobId:job.id, draftId:job.draftId, sourceHash, baseActiveVersion:job.baseActiveVersion })
  }
}

export const handler = createSermonFormationStartHandler()

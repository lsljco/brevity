import householdAuth from './household-auth.js'
import { randomUUID } from 'node:crypto'
import { analyzeSermonFormation } from './sermon-formation.mjs'
import { productionSermonSourceRepository, SERMON_JOB_LEASE_MS } from '../lib/sermon-source-repository.mjs'
import spiritualLanguage from '../lib/spiritual-language.cjs'

const { readSession } = householdAuth
const { sharedSpiritualValue:sharedValue } = spiritualLanguage
const validJobId = value => /^sermon-[a-f0-9]{40}-v\d+-[a-z0-9_-]{1,80}$/.test(String(value || ''))

export function createSermonFormationBackgroundHandler({
  sourceRepository = null,
  readSessionFn = readSession,
  analyze = analyzeSermonFormation,
  now = () => new Date(),
} = {}) {
  return async request => {
    const sources = sourceRepository || productionSermonSourceRepository()
    const session = await readSessionFn({ headers:{ cookie:request.headers.get('cookie') || '' } }).catch(() => null)
    if (!session) return new Response(JSON.stringify({ error:'Sign in to analyze a sermon source.' }), { status:401, headers:{ 'content-type':'application/json' } })
    const body = await request.json().catch(() => ({})), jobId = String(body.jobId || '')
    if (!validJobId(jobId)) return new Response(JSON.stringify({ error:'A valid sermon-analysis job is required.' }), { status:400, headers:{ 'content-type':'application/json' } })
    const workerId = randomUUID()
    const claim = await sources.claimJob(jobId, session.member, { workerId }).catch(error => ({ error }))
    if (claim.error) {
      const status = claim.error.code === 'FORBIDDEN' ? 403 : claim.error.code === 'VERSION_CONFLICT' ? 409 : 500
      return new Response(JSON.stringify({ error:claim.error.message }), { status, headers:{ 'content-type':'application/json' } })
    }
    if (!claim.claimed) return new Response(JSON.stringify({ accepted:true, recovered:true, state:claim.status?.state || claim.job.state }), { status:202, headers:{ 'content-type':'application/json' } })
    const job = claim.job
    let heartbeatError = null
    const heartbeat = setInterval(() => {
      sources.heartbeatJob(jobId, session.member, workerId).catch(error => { heartbeatError = error })
    }, Math.max(10_000, Math.floor(SERMON_JOB_LEASE_MS / 3)))
    heartbeat.unref?.()
    try {
      const analyzed = sharedValue(await analyze(job.request || {}))
      if (heartbeatError) throw heartbeatError
      await sources.heartbeatJob(jobId, session.member, workerId)
      const source = { ...(analyzed.source || {}), sourceHash:job.sourceHash }
      const draft = await sources.saveDraft({
        id:job.draftId,
        sourceHash:job.sourceHash,
        baseActiveVersion:job.baseActiveVersion,
        baseActiveSourceHash:job.baseActiveSourceHash || '',
        createdBy:session.member,
        generatedAt:analyzed.generatedAt || now().toISOString(),
        model:analyzed.model || '',
        source,
        sermonNotes:analyzed.sermonNotes,
        formation:analyzed.formation,
      })
      await sources.completeJob(jobId, session.member, draft, workerId)
    } catch (error) {
      console.error('[sermon-formation-background]', error)
      await sources.failJob(jobId, session.member, error, { workerId }).catch(failure => console.error('[sermon-formation-background status]', failure))
    } finally {
      clearInterval(heartbeat)
    }
    return new Response(JSON.stringify({ accepted:true }), { status:202, headers:{ 'content-type':'application/json' } })
  }
}

export default createSermonFormationBackgroundHandler()
export const config = { background:true, path:'/.netlify/functions/sermon-formation-background' }

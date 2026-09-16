import householdAuth from './household-auth.js'
import { productionSermonSourceRepository, sermonJobStatus } from '../lib/sermon-source-repository.mjs'

const { readSession } = householdAuth
const json = (status, body) => new Response(JSON.stringify(body), { status, headers:{ 'content-type':'application/json', 'cache-control':'no-store' } })
const validJobId = value => /^sermon-[a-f0-9]{40}-v\d+-[a-z0-9_-]{1,80}$/.test(String(value || ''))

export function createSermonFormationStatusHandler({ sourceRepository = null, readSessionFn = readSession, now = () => new Date() } = {}) {
  return async request => {
    const sources = sourceRepository || productionSermonSourceRepository()
    const session = await readSessionFn({ headers:{ cookie:request.headers.get('cookie') || '' } }).catch(() => null)
    if (!session) return json(401, { error:'Sign in to check sermon analysis.' })
    const jobId = new URL(request.url).searchParams.get('jobId') || ''
    if (!validJobId(jobId)) return json(400, { error:'A valid sermon-analysis job is required.' })
    const job = await sources.job(jobId)
    if (!job) return json(404, { error:'That sermon-analysis job was not found.' })
    if (job.member !== session.member) return json(403, { error:'That sermon-analysis job belongs to another household member.' })
    const status = sermonJobStatus(job, now())
    const publicJob = {
      state:status.state,
      retryable:status.retryable,
      ...(status.reason ? { reason:status.reason } : {}),
      updatedAt:job.updatedAt,
      attemptCount:Number(job.attemptCount || 0),
      ...(job.error ? { error:job.error } : {}),
      ...(job.state === 'ready' ? { result:job.result } : {}),
    }
    return json(200, publicJob)
  }
}

export default createSermonFormationStatusHandler()
export const config = { path:'/.netlify/functions/sermon-formation-status' }

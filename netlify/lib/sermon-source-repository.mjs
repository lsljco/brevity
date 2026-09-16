import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'

export const SERMON_HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
export const SERMON_STORE_NAME = 'brevity-household'
export const SERMON_JOB_LEASE_MS = 90_000
export const SERMON_JOB_DISPATCH_LEASE_MS = 30_000
export const SERMON_JOB_MAX_ATTEMPTS = 3
export const SERMON_JOB_MAX_AGE_MS = 20 * 60_000
export const activeSermonKey = (householdId = SERMON_HOUSEHOLD_ID) => `${householdId}/spiritual/active-sermon`
export const sermonDraftKey = (id, householdId = SERMON_HOUSEHOLD_ID) => `${householdId}/spiritual/sermon-drafts/${safeId(id)}`
export const sermonJobKey = (id, householdId = SERMON_HOUSEHOLD_ID) => `${householdId}/sermon-jobs/${safeId(id)}`

const missingBlob = error => error?.status === 404 || error?.statusCode === 404 || error?.name === 'NotFoundError'
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const safeId = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 160)
const safeMember = value => safeId(value).toLowerCase() || 'member'
const conflict = message => Object.assign(new Error(message), { code:'VERSION_CONFLICT' })
const milliseconds = value => {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function sermonJobStatus(job, instant = new Date()) {
  if (!job) return { state:'missing', retryable:false }
  if (job.state === 'ready' || job.state === 'error') return { state:job.state, retryable:job.state === 'error' && Boolean(job.request) }
  const nowMs = instant instanceof Date ? instant.getTime() : Number(instant)
  const age = nowMs - milliseconds(job.createdAt)
  if (!Number.isFinite(nowMs) || age >= SERMON_JOB_MAX_AGE_MS) {
    return { state:'timeout', retryable:Boolean(job.request), reason:'Sermon analysis reached its time limit. Retry the retained source; the active sermon was not changed.' }
  }
  if (job.state === 'pending' && job.queuedAt && milliseconds(job.dispatchExpiresAt) <= nowMs) {
    return { state:'stalled', retryable:true, reason:'The analysis request was not picked up. Brevity can safely queue the retained job again.' }
  }
  if (job.state === 'processing' && milliseconds(job.leaseExpiresAt) <= nowMs) {
    const retryable = Number(job.attemptCount || 0) < SERMON_JOB_MAX_ATTEMPTS
    return { state:'stalled', retryable, reason:retryable ? 'The analysis worker stopped responding. Brevity can safely resume the retained job.' : 'Sermon analysis stopped after three worker attempts. Retry the retained source when ready.' }
  }
  return { state:job.state === 'processing' ? 'processing' : 'pending', retryable:false }
}

export function sermonSourceHash(text) {
  const source = String(text || '').trim()
  if (!source) throw new Error('A sermon transcript or existing sermon-notes document is required.')
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

export function sermonDraftId({ sourceHash, baseActiveVersion, member }) {
  if (!/^[a-f0-9]{64}$/.test(String(sourceHash || ''))) throw new Error('A valid sermon source hash is required.')
  const version = Number(baseActiveVersion)
  if (!Number.isInteger(version) || version < 0) throw new Error('A valid active-sermon version is required.')
  return `${sourceHash.slice(0, 40)}-v${version}-${safeMember(member)}`
}

export function sermonJobId(input) {
  return `sermon-${sermonDraftId(input)}`
}

export function sermonArtifactId({ sermonDate, title, sourceHash, activeVersion }) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(sermonDate || '')) ? sermonDate : 'undated'
  const slug = String(title || 'sermon-notes').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'sermon-notes'
  if (!/^[a-f0-9]{64}$/.test(String(sourceHash || ''))) throw new Error('A valid sermon source hash is required.')
  const version = Number(activeVersion)
  if (!Number.isInteger(version) || version < 1) throw new Error('A reviewed active-sermon version is required.')
  return `${date}-${slug}-${sourceHash.slice(0, 12)}-v${version}`
}

export function activeSermonVersion(value) {
  const version = Number(value?.version || 0)
  return Number.isInteger(version) && version >= 0 ? version : 0
}

export async function requireReviewedActiveSermon({ repository = productionSermonSourceRepository(), expectedVersion, sourceHash } = {}) {
  const version = Number(expectedVersion)
  if (!Number.isInteger(version) || version < 1 || !/^[a-f0-9]{64}$/.test(String(sourceHash || ''))) {
    throw Object.assign(new Error('Choose the current reviewed active sermon before generating documents or slides.'), { code:'VERSION_CONFLICT' })
  }
  const active = await repository.active()
  if (!active.value?.sermonNotes || active.version !== version || active.value.source?.sourceHash !== sourceHash) {
    throw Object.assign(new Error('The active sermon changed after this screen loaded. Refresh and review the current sermon before generating artifacts.'), { code:'VERSION_CONFLICT' })
  }
  return active.value
}

async function readEntry(store, key) {
  if (typeof store.getWithMetadata === 'function') {
    const entry = await store.getWithMetadata(key, { type:'json' }).catch(error => {
      if (missingBlob(error)) return null
      throw error
    })
    return entry ? { value:entry.data, etag:entry.etag || null, exists:true } : { value:null, etag:null, exists:false }
  }
  const value = await store.get(key, { type:'json' }).catch(error => {
    if (missingBlob(error)) return null
    throw error
  })
  return { value, etag:null, exists:value != null }
}

export function createSermonSourceRepository({ store, householdId = SERMON_HOUSEHOLD_ID, now = () => new Date() } = {}) {
  const dataStore = store || getStore({ name:SERMON_STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  const read = key => readEntry(dataStore, key)
  const writeConditional = async (key, value, entry) => {
    if (entry.exists && !entry.etag) throw conflict('Sermon source storage did not include a safe version marker. Refresh before trying again.')
    const result = await dataStore.setJSON(key, value, entry.exists ? { onlyIfMatch:entry.etag } : { onlyIfNew:true })
    if (result?.modified === false) throw conflict('The sermon source workflow changed on another request. Refresh before trying again.')
    return value
  }
  return {
    store:dataStore,
    async active() {
      const entry = await read(activeSermonKey(householdId))
      return { ...entry, version:activeSermonVersion(entry.value) }
    },
    async draft(id) {
      return (await read(sermonDraftKey(id, householdId))).value
    },
    async job(id) {
      return (await read(sermonJobKey(id, householdId))).value
    },
    async createJob({ member, request, sourceHash, baseActiveVersion, baseActiveSourceHash = '' }) {
      const draftId = sermonDraftId({ sourceHash, baseActiveVersion, member })
      const id = sermonJobId({ sourceHash, baseActiveVersion, member })
      const key = sermonJobKey(id, householdId)
      const entry = await read(key)
      if (entry.value) {
        if (entry.value.member !== member || entry.value.sourceHash !== sourceHash || Number(entry.value.baseActiveVersion) !== Number(baseActiveVersion)) {
          throw conflict('This sermon-analysis identity belongs to a different source or household member.')
        }
        const status = sermonJobStatus(entry.value, now())
        if (['error', 'timeout'].includes(status.state)) {
          const instant = now().toISOString()
          const restarted = {
            ...entry.value, state:'pending', request:clone(request), attemptCount:0,
            createdAt:instant, updatedAt:instant, error:undefined, processingStartedAt:undefined,
            leaseId:undefined, leaseExpiresAt:undefined, queuedAt:undefined, dispatchExpiresAt:undefined, completedAt:undefined,
          }
          await writeConditional(key, restarted, entry)
          return { job:restarted, created:false, shouldQueue:true, restarted:true }
        }
        if (status.state === 'stalled') {
          const recovered = { ...entry.value, state:'pending', updatedAt:now().toISOString(), queuedAt:undefined, dispatchExpiresAt:undefined }
          await writeConditional(key, recovered, entry)
          return { job:recovered, created:false, shouldQueue:true, recovered:true }
        }
        return { job:entry.value, created:false, shouldQueue:status.state === 'pending' && !entry.value.queuedAt }
      }
      const instant = now().toISOString()
      const job = {
        id, draftId, member, state:'pending', sourceHash, baseActiveVersion:Number(baseActiveVersion),
        baseActiveSourceHash:String(baseActiveSourceHash || ''), request:clone(request), attemptCount:0,
        createdAt:instant, updatedAt:instant,
      }
      await writeConditional(key, job, entry)
      return { job, created:true, shouldQueue:true }
    },
    async requeueJob(id, member, { restart = false } = {}) {
      const key = sermonJobKey(id, householdId), entry = await read(key), current = entry.value
      if (!current || current.member !== member) throw Object.assign(new Error('That sermon-analysis job is not available to this member.'), { code:'FORBIDDEN' })
      const status = sermonJobStatus(current, now())
      if (current.state === 'ready') return { job:current, shouldQueue:false }
      if (['error', 'timeout'].includes(status.state)) {
        if (!restart || !current.request) return { job:current, shouldQueue:false, terminal:true, status }
        const instant = now().toISOString()
        const job = {
          ...current, state:'pending', attemptCount:0, createdAt:instant, updatedAt:instant,
          error:undefined, processingStartedAt:undefined, leaseId:undefined, leaseExpiresAt:undefined,
          queuedAt:undefined, dispatchExpiresAt:undefined,
        }
        await writeConditional(key, job, entry)
        return { job, shouldQueue:true, restarted:true }
      }
      if (status.state === 'processing') return { job:current, shouldQueue:false }
      if (status.state === 'stalled' && !status.retryable) {
        const job = { ...current, state:'error', error:status.reason, updatedAt:now().toISOString(), leaseId:undefined, leaseExpiresAt:undefined }
        await writeConditional(key, job, entry)
        return { job, shouldQueue:false, terminal:true, status:{ state:'error', retryable:Boolean(job.request), reason:job.error } }
      }
      const job = status.state === 'pending' ? current : {
        ...current, state:'pending', updatedAt:now().toISOString(), processingStartedAt:undefined,
        leaseId:undefined, leaseExpiresAt:undefined, queuedAt:undefined, dispatchExpiresAt:undefined,
      }
      if (job !== current) await writeConditional(key, job, entry)
      return { job, shouldQueue:true, recovered:status.state === 'stalled' }
    },
    async markJobQueued(id, member, { dispatchMs = SERMON_JOB_DISPATCH_LEASE_MS } = {}) {
      const key = sermonJobKey(id, householdId), entry = await read(key), current = entry.value
      if (!current || current.member !== member) throw Object.assign(new Error('That sermon-analysis job is not available to this member.'), { code:'FORBIDDEN' })
      if (current.state !== 'pending') return { job:current, dispatch:false }
      const status = sermonJobStatus(current, now())
      if (current.queuedAt && status.state === 'pending') return { job:current, dispatch:false }
      const instant = now()
      const job = { ...current, queuedAt:instant.toISOString(), dispatchExpiresAt:new Date(instant.getTime() + dispatchMs).toISOString(), updatedAt:instant.toISOString() }
      await writeConditional(key, job, entry)
      return { job, dispatch:true }
    },
    async claimJob(id, member, { workerId, leaseMs = SERMON_JOB_LEASE_MS } = {}) {
      const key = sermonJobKey(id, householdId), entry = await read(key), current = entry.value
      if (!current || current.member !== member) throw Object.assign(new Error('That sermon-analysis job is not available to this member.'), { code:'FORBIDDEN' })
      if (!workerId) throw new Error('A sermon-analysis worker identity is required.')
      const status = sermonJobStatus(current, now())
      if (['ready', 'error', 'timeout'].includes(status.state) || status.state === 'processing') return { job:current, claimed:false, status }
      if (status.state === 'stalled' && !status.retryable) return { job:current, claimed:false, status }
      const instant = now()
      const job = {
        ...current, state:'processing', attemptCount:Number(current.attemptCount || 0) + 1,
        processingStartedAt:instant.toISOString(), leaseId:String(workerId),
        leaseExpiresAt:new Date(instant.getTime() + leaseMs).toISOString(), updatedAt:instant.toISOString(), dispatchExpiresAt:undefined,
      }
      await writeConditional(key, job, entry)
      return { job, claimed:true }
    },
    async heartbeatJob(id, member, workerId, { leaseMs = SERMON_JOB_LEASE_MS } = {}) {
      const key = sermonJobKey(id, householdId), entry = await read(key), current = entry.value
      if (!current || current.member !== member || current.state !== 'processing' || current.leaseId !== workerId) {
        throw conflict('This sermon-analysis worker no longer owns the retained job.')
      }
      const instant = now()
      const job = { ...current, leaseExpiresAt:new Date(instant.getTime() + leaseMs).toISOString(), updatedAt:instant.toISOString() }
      await writeConditional(key, job, entry)
      return job
    },
    async saveDraft(draft) {
      const key = sermonDraftKey(draft.id, householdId), entry = await read(key)
      if (entry.value) {
        if (entry.value.sourceHash !== draft.sourceHash || Number(entry.value.baseActiveVersion) !== Number(draft.baseActiveVersion) || entry.value.createdBy !== draft.createdBy) {
          throw conflict('This sermon draft identity belongs to different source content.')
        }
        return entry.value
      }
      const created = { ...clone(draft), state:'ready', createdAt:draft.createdAt || now().toISOString() }
      await writeConditional(key, created, entry)
      return created
    },
    async completeJob(id, member, draft, workerId) {
      const key = sermonJobKey(id, householdId), entry = await read(key), current = entry.value
      if (!current || current.member !== member) throw Object.assign(new Error('That sermon-analysis job is not available to this member.'), { code:'FORBIDDEN' })
      if (current.state === 'ready') return current
      if (current.state !== 'processing' || !workerId || current.leaseId !== workerId) throw conflict('The sermon-analysis job is not owned by the active worker.')
      const job = {
        ...current, state:'ready', draftId:draft.id,
        result:{
          draftId:draft.id, sourceHash:draft.sourceHash, baseActiveVersion:draft.baseActiveVersion,
          generatedAt:draft.generatedAt, model:draft.model, source:draft.source,
          sermonNotes:draft.sermonNotes, formation:draft.formation,
        },
        updatedAt:now().toISOString(), completedAt:now().toISOString(), request:undefined,
        leaseId:undefined, leaseExpiresAt:undefined,
      }
      await writeConditional(key, job, entry)
      return job
    },
    async failJob(id, member, error, { workerId = '' } = {}) {
      const key = sermonJobKey(id, householdId), entry = await read(key), current = entry.value
      if (!current || current.member !== member || current.state === 'ready') return current
      if (workerId && (current.state !== 'processing' || current.leaseId !== workerId)) throw conflict('This sermon-analysis worker no longer owns the retained job.')
      const job = {
        ...current, state:'error', error:String(error?.message || error || 'Background sermon analysis failed.'),
        updatedAt:now().toISOString(), leaseId:undefined, leaseExpiresAt:undefined,
      }
      await writeConditional(key, job, entry)
      return job
    },
  }
}

export function productionSermonSourceRepository(options = {}) {
  return createSermonSourceRepository(options)
}

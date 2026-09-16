import { createHash, randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { normalizePermissionMatrix } from './assistant-action-contract.mjs'

const STORE_NAME = 'brevity-assistant-actions'
const safe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 160)
const conflictError = message => Object.assign(new Error(message), { code:'JOURNAL_CONFLICT' })
const legacyCompletionHash = audit => createHash('sha256').update(JSON.stringify({
  id:audit.id,proposalId:audit.proposalId,action:audit.action,actor:audit.actor,
  occurredAt:audit.occurredAt,operations:audit.operations||[],changes:audit.changes||[],
})).digest('hex')
const auditIndexEntry = audit => ({
  id:audit.id,journalId:audit.journalId,proposalId:audit.proposalId,summary:audit.summary,
  actor:audit.actor,actorRole:audit.actorRole,action:audit.action,status:audit.status,
  occurredAt:audit.occurredAt,undoAvailable:Boolean(audit.undoAvailable),
  ...(audit.undoneAt?{undoneAt:audit.undoneAt}:{}),...(audit.undoneBy?{undoneBy:audit.undoneBy}:{}),
  ...(audit.undoAuditId?{undoAuditId:audit.undoAuditId}:{}),
  operations:(audit.operations||[]).map(({id,type,domain,description,targetId,targetDate,selectedScope})=>({id,type,domain,description,targetId,targetDate,selectedScope})),
  affectedRecords:(audit.changes||[]).map(({resource,beforeVersion,afterVersion})=>({resource,beforeVersion,afterVersion})),
  restored:audit.restored||[],
})

export function createAssistantActionRepository({ store, householdId = 'lslj-family', now = () => new Date(), createId = randomUUID }) {
  const root = safe(householdId)
  const key = suffix => `${root}/${suffix}`
  const missingBlob = error => error?.status===404||error?.statusCode===404||error?.name==='NotFoundError'
  const getJson = suffix => store.get(key(suffix), { type:'json' }).catch(error=>{if(missingBlob(error))return null;throw error})
  const setJson = (suffix, value, options) => store.setJSON(key(suffix), value, options)
  const getEntry = async suffix => {
    if(typeof store.getWithMetadata==='function'){
      const entry=await store.getWithMetadata(key(suffix),{type:'json'}).catch(error=>{if(missingBlob(error))return null;throw error})
      return entry?{value:entry.data,etag:entry.etag||null,exists:true}:{value:null,etag:null,exists:false}
    }
    const value=await getJson(suffix)
    return{value,etag:null,exists:value!==null}
  }
  const replaceHistoryIndex = async updater => {
    for(let attempt=0;attempt<5;attempt+=1){
      const entry=await getEntry('history')
      if(entry.exists&&!entry.etag)throw conflictError('Action Mode history did not include a safe version marker. Refresh before changing it.')
      const current=Array.isArray(entry.value)?entry.value:[]
      const next=updater(current).slice(0,100)
      const options=entry.exists?{onlyIfMatch:entry.etag}:{onlyIfNew:true}
      const result=await setJson('history',next,options)
      if(result?.modified!==false)return next
    }
    throw conflictError('Action Mode saved the immutable audit, but could not update its visible history after repeated concurrent changes. Retry to repair the history index.')
  }
  const updateJournal = async (id, updater) => {
    const suffix=`journals/${safe(id)}`
    for(let attempt=0;attempt<5;attempt+=1){
      const entry=await getEntry(suffix)
      if(!entry.value)throw new Error('The Action Mode recovery journal no longer exists.')
      if(!entry.etag)throw conflictError('The Action Mode recovery journal did not include a safe version marker. Refresh before retrying this action.')
      const next=updater(entry.value)
      if(!next||next.id!==entry.value.id)throw new Error('The Action Mode recovery journal update is invalid.')
      const result=await setJson(suffix,next,{onlyIfMatch:entry.etag})
      if(result?.modified!==false)return next
    }
    throw conflictError('Action Mode could not advance its recovery journal after repeated concurrent changes. Retry this action.')
  }
  return {
    async saveProposal(proposal) {
      const result=await setJson(`proposals/${safe(proposal.id)}`, proposal, {onlyIfNew:true})
      if(result?.modified===false)throw new Error('A proposal with this identifier already exists.')
      return proposal
    },
    getProposal: id => getJson(`proposals/${safe(id)}`),
    async getProposalEntry(id) { const entry=await getEntry(`proposals/${safe(id)}`);return{proposal:entry.value,etag:entry.etag} },
    async saveProposalState(proposal,{onlyIfMatch}={}) {
      if(!onlyIfMatch)throw conflictError('The Action Mode proposal did not include a safe version marker. Refresh and review it again.')
      const result=await setJson(`proposals/${safe(proposal.id)}`,proposal,{onlyIfMatch})
      return{proposal,modified:result?.modified!==false,etag:result?.etag||null}
    },
    async getPermissionsState() {
      const entry=await getEntry('permissions'),record=entry.value
      const storedVersion=record?.version
      const version=Number.isInteger(storedVersion)&&storedVersion>=0?storedVersion:0
      return{permissions:normalizePermissionMatrix(record),version,record,etag:entry.etag}
    },
    async getPermissions() { return normalizePermissionMatrix(await getJson('permissions')) },
    async savePermissions(matrix, actor, expectedVersion, mutationId = '') {
      const entry=await getEntry('permissions'),current=entry.value,currentVersion=Number.isInteger(current?.version)&&current.version>=0?current.version:0
      if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw Object.assign(new Error('Action Mode permissions must be refreshed and reviewed before saving.'),{code:'VERSION_CONFLICT'})
      if(expectedVersion!==currentVersion)throw Object.assign(new Error('Action Mode permissions changed after review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
      if(entry.exists&&!entry.etag)throw Object.assign(new Error('Action Mode permissions did not include a safe version marker. Refresh before saving.'),{code:'VERSION_CONFLICT'})
      const value = { ...normalizePermissionMatrix(matrix), version:currentVersion+1,updatedAt:now().toISOString(),updatedBy:actor,lastActionId:mutationId||'' }
      const result=await setJson('permissions',value,current?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
      if(result?.modified===false)throw Object.assign(new Error('Action Mode permissions changed while this update was being saved. Refresh and try again.'),{code:'VERSION_CONFLICT'})
      return value
    },
    async addAudit(entry,{idempotent=false}={}) {
      const record = { id:createId(), occurredAt:now().toISOString(), ...entry }
      // Preserve every audit as its own immutable record. `history` is only a
      // bounded, CAS-updated display index and may safely age entries out.
      const archived=await setJson(`audits/${safe(record.id)}`,record,{onlyIfNew:true})
      let stored=record
      if(archived?.modified===false){
        if(!idempotent)throw new Error('This Action Mode audit identifier already exists.')
        stored=await getJson(`audits/${safe(record.id)}`)
        if(!stored||!record.completionHash||stored.completionHash!==record.completionHash||stored.proposalId!==record.proposalId||stored.action!==record.action||stored.journalId!==record.journalId){
          throw new Error('This Action Mode audit identifier belongs to a different completed action.')
        }
      }
      const status=await getJson(`audit-status/${safe(stored.id)}`)
      const visible={...auditIndexEntry(stored),...(status||{})}
      await replaceHistoryIndex(history=>[visible,...history.filter(item=>item.id!==stored.id)])
      const latestStatus=await getJson(`audit-status/${safe(stored.id)}`)
      return{...stored,...(latestStatus||{})}
    },
    async getAudit(id) {
      if(!id)return null
      let audit=await getJson(`audits/${safe(id)}`)
      // Releases before the immutable archive stored complete audits only in
      // the bounded history blob. Backfill a visible legacy entry on first
      // lookup so a deployment cannot strand an otherwise valid Undo.
      if(!audit){
        const history=await getJson('history')
        const legacy=Array.isArray(history)?history.find(item=>item?.id===id):null
        if(legacy){
          const archived={legacySource:'history-v0',completionHash:legacy.completionHash||legacyCompletionHash(legacy),...legacy}
          const created=await setJson(`audits/${safe(id)}`,archived,{onlyIfNew:true})
          audit=created?.modified===false?await getJson(`audits/${safe(id)}`):archived
        }
      }
      const status=await getJson(`audit-status/${safe(id)}`)
      return audit?{...audit,...(status||{})}:null
    },
    async history() {
      const stored=await getJson('history'),recent=(Array.isArray(stored)?stored:[]).slice(0,100)
      // Status markers are immutable and authoritative. Hydration prevents a
      // concurrent idempotent index repair from ever making an undone action
      // appear Undoable again, even if the lightweight index briefly races.
      return Promise.all(recent.map(async item=>({...item,...((await getJson(`audit-status/${safe(item.id)}`))||{})})))
    },
    async markAuditUndone(id,status) {
      const marker={auditId:id,undoAvailable:false,...status}
      const archived=await setJson(`audit-status/${safe(id)}`,marker,{onlyIfNew:true})
      if(archived?.modified===false){
        const existing=await getJson(`audit-status/${safe(id)}`)
        if(!existing||existing.undoAuditId!==marker.undoAuditId)throw new Error('This Action Mode action has already been finalized by a different Undo.')
      }
      await replaceHistoryIndex(history=>history.map(item=>item.id===id?{...item,...marker}:item))
      return marker
    },
    async saveCalendarMutationReceipt(receipt) {
      if(!receipt?.id||!receipt?.href||!receipt?.reviewedEtag)throw new Error('The Family Calendar mutation receipt is invalid.')
      const suffix=`calendar-receipts/${safe(receipt.id)}`
      const created=await setJson(suffix,receipt,{onlyIfNew:true})
      if(created?.modified!==false)return receipt
      const existing=await getJson(suffix)
      if(!existing||existing.kind!==receipt.kind||existing.href!==receipt.href||existing.reviewedEtag!==receipt.reviewedEtag){
        throw conflictError('This Action Mode identity belongs to a different Family Calendar mutation.')
      }
      return existing
    },
    getCalendarMutationReceipt:id=>getJson(`calendar-receipts/${safe(id)}`),
    async ensureJournal(journal) {
      if(!journal?.id||!journal.kind||!journal.subjectId)throw new Error('The Action Mode recovery journal is invalid.')
      const suffix=`journals/${safe(journal.id)}`
      const created=await setJson(suffix,journal,{onlyIfNew:true})
      if(created?.modified!==false)return journal
      const existing=await getJson(suffix)
      if(!existing||existing.kind!==journal.kind||existing.subjectId!==journal.subjectId||existing.actor!==journal.actor||existing.requestHash!==journal.requestHash){
        throw new Error('This Action Mode recovery journal belongs to a different action.')
      }
      return existing
    },
    async getJournalEntry(id) {
      const entry=await getEntry(`journals/${safe(id)}`)
      return{journal:entry.value,etag:entry.etag}
    },
    async saveJournalState(journal,{onlyIfMatch}={}) {
      if(!onlyIfMatch)throw conflictError('The Action Mode recovery journal did not include a safe version marker. Refresh before retrying this action.')
      const result=await setJson(`journals/${safe(journal.id)}`,journal,{onlyIfMatch})
      return{journal,modified:result?.modified!==false,etag:result?.etag||null}
    },
    updateJournal,
  }
}

export function productionAssistantActionRepository(options = {}) {
  const store = getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  return createAssistantActionRepository({ store, householdId:process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family', ...options })
}

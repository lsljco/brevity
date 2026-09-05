import { randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { normalizePermissionMatrix } from './assistant-action-contract.mjs'

const STORE_NAME = 'brevity-assistant-actions'
const safe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 160)

export function createAssistantActionRepository({ store, householdId = 'lslj-family', now = () => new Date(), createId = randomUUID }) {
  const root = safe(householdId)
  const key = suffix => `${root}/${suffix}`
  const getJson = suffix => store.get(key(suffix), { type:'json' }).catch(() => null)
  const setJson = (suffix, value) => store.setJSON(key(suffix), value)
  return {
    async saveProposal(proposal) { await setJson(`proposals/${safe(proposal.id)}`, proposal); return proposal },
    getProposal: id => getJson(`proposals/${safe(id)}`),
    async saveProposalState(proposal) { await setJson(`proposals/${safe(proposal.id)}`, proposal); return proposal },
    async getPermissions() { return normalizePermissionMatrix(await getJson('permissions')) },
    async savePermissions(matrix, actor) {
      const value = { ...normalizePermissionMatrix(matrix), updatedAt:now().toISOString(), updatedBy:actor }
      await setJson('permissions', value)
      return value
    },
    async addAudit(entry) {
      const stored = await getJson('history')
      const history = Array.isArray(stored) ? stored : []
      const record = { id:createId(), occurredAt:now().toISOString(), ...entry }
      await setJson('history', [record, ...history].slice(0, 100))
      return record
    },
    async history() { const stored=await getJson('history');return(Array.isArray(stored)?stored:[]).slice(0,100) },
    async replaceHistory(history) { await setJson('history',(Array.isArray(history)?history:[]).slice(0,100));return history },
  }
}

export function productionAssistantActionRepository(options = {}) {
  const store = getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  return createAssistantActionRepository({ store, householdId:process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family', ...options })
}

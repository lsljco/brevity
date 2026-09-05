import { randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { deleteRecurringOccurrence, editRecurringOccurrence } from '../../src/finance/recurrenceEditing.js'
import { createEmptyDailyPlan } from '../../src/household/dailyPlan.js'
import { permissionForOperation, selectedOperation } from './assistant-action-contract.mjs'

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const SHARED_STORE = 'brevity-household-state'
const PLAN_STORE = 'brevity-household'
const SHARED_KEYS = {
  projects:'homehq_items_v1', calendar:'family_calendar_events_v1', overrides:'lslj_tx_overrides_v1',
  budget:'lslj_budget_v1', finance:'lslj_finance_v9',
}
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const nowIso = now => now().toISOString()

export function resourceForOperation(operation) {
  if (operation.domain === 'planning') return `plan:${operation.targetDate}`
  if (operation.domain === 'projects') return `shared:${SHARED_KEYS.projects}`
  if (operation.type.startsWith('calendar.')) return 'calendar:apple-family'
  if (operation.type === 'transaction.categorize') return `shared:${SHARED_KEYS.overrides}`
  if (operation.type === 'budget.update') return `shared:${SHARED_KEYS.budget}`
  if (operation.type.startsWith('recurring.')) return `shared:${SHARED_KEYS.finance}`
  throw new Error(`No action resource exists for ${operation.type}.`)
}

function findRecord(value, operation) {
  if (operation.type === 'decision.update') return (value?.decisions || []).find(item => item.id === operation.targetId)
  if (operation.type === 'assignment.update') return (value?.assignments || []).find(item => item.id === operation.targetId)
  if (operation.type === 'project.update') return (Array.isArray(value) ? value : []).find(item => item.id === operation.targetId)
  if (operation.type.startsWith('recurring.')) return (value?.transactions || []).find(item => item.id === operation.targetId)
  return null
}

function mergeAllowed(record, payload) { return { ...record, ...clone(payload), updatedAt:new Date().toISOString() } }

export function applyRecordOperation(value, operation, createId = randomUUID) {
  const before = clone(value)
  const payload = operation.payload || {}
  if (operation.type === 'decision.update') {
    let found = false
    const next = { ...value, decisions:(value?.decisions || []).map(item => { if (item.id !== operation.targetId) return item; found = true; return mergeAllowed(item, payload) }) }
    if (!found) throw new Error('That decision no longer exists. Refresh Brevity and ask again.')
    return { before, after:next }
  }
  if (operation.type === 'assignment.create') {
    const item = { id:createId(), title:payload.title || operation.description, notes:payload.notes || '', owner:payload.owner || 'Family', participants:payload.participants || [], status:payload.status || 'pending', date:operation.targetDate || payload.date || '', priority:payload.priority || 'normal', calendarSync:false, createdAt:new Date().toISOString() }
    return { before, after:{ ...value, assignments:[...(value?.assignments || []), item] }, createdId:item.id }
  }
  if (operation.type === 'assignment.update') {
    let found = false
    const next = { ...value, assignments:(value?.assignments || []).map(item => { if (item.id !== operation.targetId) return item; found = true; return mergeAllowed(item, payload) }) }
    if (!found) throw new Error('That assignment no longer exists. Refresh Brevity and ask again.')
    return { before, after:next }
  }
  if (operation.type === 'project.create') {
    const item = { id:createId(), title:payload.title || operation.description, notes:payload.notes || '', status:payload.status || 'planning', priority:payload.priority || 'normal', startDate:payload.date || operation.targetDate || '', due:payload.endDate || payload.date || operation.targetDate || '', raci:payload.raci || { responsible:payload.owner ? [payload.owner] : [], accountable:[], consulted:[], informed:[] }, pushToFamilyCalendar:Boolean(payload.pushToFamilyCalendar), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
    return { before, after:[...(Array.isArray(value) ? value : []), item], createdId:item.id }
  }
  if (operation.type === 'project.update') {
    let found = false
    const after = (Array.isArray(value) ? value : []).map(item => { if (item.id !== operation.targetId) return item; found = true; return mergeAllowed(item, payload) })
    if (!found) throw new Error('That project no longer exists. Refresh Brevity and ask again.')
    return { before, after }
  }
  if (operation.type === 'transaction.categorize') {
    if (!operation.targetId || !payload.category) throw new Error('A transaction and category are required.')
    return { before, after:{ ...(value || {}), [operation.targetId]:{ ...(value?.[operation.targetId] || {}), id:operation.targetId, category:payload.category } } }
  }
  if (operation.type === 'budget.update') {
    const item = operation.targetId || payload.title
    const month = Number(payload.month)
    if (!item || !Number.isInteger(month) || month < 0 || month > 11) throw new Error('A budget item and month from 0 through 11 are required.')
    const row = Array.isArray(value?.[item]) ? [...value[item]] : Array(12).fill(0)
    row[month] = Number(payload.value ?? payload.amount) || 0
    return { before, after:{ ...(value || {}), [item]:row } }
  }
  if (operation.type === 'recurring.update' || operation.type === 'recurring.delete') {
    const transactions = [...(value?.transactions || [])]
    const original = transactions.find(item => item.id === operation.targetId)
    if (!original) throw new Error('That recurring record no longer exists. Refresh Brevity and ask again.')
    if (!operation.targetDate) throw new Error('Choose the occurrence date for this recurring change.')
    const scope = operation.selectedScope === 'this-and-future' ? 'future' : 'one'
    const result = operation.type === 'recurring.delete'
      ? deleteRecurringOccurrence(original, operation.targetDate, scope)
      : editRecurringOccurrence(original, { ...original, ...payload }, operation.targetDate, scope, createId)
    const deleteIds = new Set(result.deleteIds)
    const upserts = new Map(result.upserts.map(item => [item.id, item]))
    const afterTransactions = transactions.filter(item => !deleteIds.has(item.id) && !upserts.has(item.id))
    return { before, after:{ ...value, transactions:[...afterTransactions, ...upserts.values()] } }
  }
  throw new Error(`The ${operation.type} action is not supported by this executor.`)
}

export function createProductionActionResources({ now = () => new Date() } = {}) {
  const shared = getStore({ name:SHARED_STORE, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  const plans = getStore({ name:PLAN_STORE, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  const sharedKey = key => `${HOUSEHOLD_ID}/records/${key}`
  const planKey = date => `${HOUSEHOLD_ID}/daily-plans/${date}`
  return {
    async read(resource) {
      if (resource.startsWith('shared:')) { const key=resource.slice(7), record=await shared.get(sharedKey(key),{type:'json'}).catch(()=>null); return { value:record?.value ? JSON.parse(record.value) : key===SHARED_KEYS.overrides||key===SHARED_KEYS.budget?{}:[], version:Number(record?.version||0), record } }
      if (resource.startsWith('plan:')) {
        const date=resource.slice(5),value=await plans.get(planKey(date),{type:'json'}).catch(()=>null)
        return { value:value||createEmptyDailyPlan(date), version:Number(value?.version||0), missing:!value }
      }
      throw new Error(`Cannot read ${resource}.`)
    },
    async write(resource, value, expectedVersion, actor) {
      const occurredAt=nowIso(now)
      if (resource.startsWith('shared:')) {
        const key=resource.slice(7), current=await shared.get(sharedKey(key),{type:'json'}).catch(()=>null), version=Number(current?.version||0)
        if(version!==expectedVersion)throw Object.assign(new Error('Household data changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
        const serialized=JSON.stringify(value), record={key,value:serialized,hash:'assistant-action',version:version+1,updatedAt:occurredAt,updatedBy:actor}
        await shared.setJSON(sharedKey(key),record); return { version:record.version, value }
      }
      const date=resource.slice(5), current=await plans.get(planKey(date),{type:'json'}).catch(()=>null), version=Number(current?.version||0)
      if(version!==expectedVersion)throw Object.assign(new Error('The daily plan changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
      const record={...value,date,version:version+1,updatedAt:occurredAt,updatedBy:actor}
      await plans.setJSON(planKey(date),record); return {version:record.version,value:record}
    },
  }
}

export async function executeRecordOperations({ proposal, selections = {}, session, permissions, resources, now = () => new Date() }) {
  const operations = proposal.operations.map(operation => selectedOperation(operation, selections[operation.id]))
  const grouped = new Map()
  for (const operation of operations) {
    if (operation.type.startsWith('calendar.')) continue
    const resource = resourceForOperation(operation)
    if (!grouped.has(resource)) grouped.set(resource, [])
    grouped.get(resource).push(operation)
  }
  const changes=[]
  for (const [resource, resourceOperations] of grouped) {
    const current=await resources.read(resource); let value=current.value
    for(const operation of resourceOperations){
      const record=findRecord(value,operation)
      const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions,currentRecord:record})
      if(!permission.allowed)throw Object.assign(new Error(permission.reason),{code:'FORBIDDEN'})
      const result=applyRecordOperation(value,operation); value=result.after
    }
    const saved=await resources.write(resource,value,current.version,`Ask Brevity · ${session.member}`)
    changes.push({resource,before:current.value,after:saved.value,beforeVersion:current.version,afterVersion:saved.version})
  }
  return { operations, changes, executedAt:nowIso(now) }
}

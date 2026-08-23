import crypto from 'node:crypto'
import { getStore } from '@netlify/blobs'
import {
  ESTATE_ENTITY_TYPES,
  estateFingerprint,
  isEstateEntityType,
  normalizeEstateEntity,
} from '../../src/estate/estateModel.js'

export const ESTATE_STORE_NAME = 'brevity-estate'
const ACTIVE_PROJECT_STATUSES = new Set(['planning', 'in_progress', 'decision_required', 'on_hold'])
const CLOSED_WORK_STATUSES = new Set(['completed', 'cost_recorded', 'cancelled', 'archived'])

function safeSegment(value, label) {
  const segment = String(value || '')
  if (!segment || !/^[A-Za-z0-9._:-]+$/.test(segment)) throw new Error(`Invalid Estate ${label}.`)
  return segment
}

export function estateRecordKey(householdId, entityType, id) {
  if (!isEstateEntityType(entityType)) throw new Error('Unknown Estate entity type.')
  return `${safeSegment(householdId, 'household')}/entities/${entityType}/${safeSegment(id, 'record id')}`
}

export function estateRecordPrefix(householdId, entityType) {
  if (!isEstateEntityType(entityType)) throw new Error('Unknown Estate entity type.')
  return `${safeSegment(householdId, 'household')}/entities/${entityType}/`
}

const auditPrefix = householdId => `${safeSegment(householdId, 'household')}/audit/`
const auditKey = (householdId, auditId, state) => `${auditPrefix(householdId)}${safeSegment(auditId, 'audit id')}/${safeSegment(state, 'audit state')}`

export function configuredEstateStore() {
  return getStore({
    name: ESTATE_STORE_NAME,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
}

async function listedRecords(store, prefix) {
  const result = await store.list({ prefix })
  const blobs = Array.isArray(result?.blobs) ? result.blobs : []
  return (await Promise.all(blobs.map(blob => store.get(blob.key, { type: 'json' })))).filter(Boolean)
}

export function createEstateRepository({ store = configuredEstateStore(), householdId, now = () => new Date().toISOString(), randomUUID = () => crypto.randomUUID() } = {}) {
  const scope = safeSegment(householdId, 'household')

  const get = async (entityType, id) => store.get(estateRecordKey(scope, entityType, id), { type: 'json' })

  const list = async (entityType, { propertyId, includeArchived = false } = {}) => {
    const records = await listedRecords(store, estateRecordPrefix(scope, entityType))
    return records
      .filter(record => includeArchived || record.status !== 'archived')
      .filter(record => !propertyId || record.propertyId === propertyId || (entityType === 'property' && record.id === propertyId))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  }

  const save = async ({ entityType, entity, actor, expectedVersion }) => {
    const current = entity.id ? await get(entityType, entity.id) : null
    if (current && expectedVersion == null) {
      const error = new Error('expectedVersion is required when updating an Estate record.')
      error.status = 409
      throw error
    }
    if (current && Number(expectedVersion) !== Number(current.version)) {
      const error = new Error(`Estate record changed from version ${expectedVersion} to ${current.version}. Refresh before saving.`)
      error.status = 409
      error.current = current
      throw error
    }
    if (!current && expectedVersion != null && Number(expectedVersion) !== 0) {
      const error = new Error('A new Estate record must use expectedVersion 0.')
      error.status = 409
      throw error
    }
    const timestamp = now()
    const id = String(entity.id || `${entityType}-${randomUUID()}`)
    const next = normalizeEstateEntity(entityType, {
      ...entity,
      id,
      createdAt: current?.createdAt || entity.createdAt,
      createdBy: current?.createdBy || entity.createdBy,
    }, { householdId: scope, actor, now: timestamp, version: current ? Number(current.version) + 1 : 1 })
    const serialized = JSON.stringify(next)
    if (Buffer.byteLength(serialized, 'utf8') > 750_000) {
      const error = new Error('Estate metadata records cannot contain large embedded files. Upload the file separately and store its document link.')
      error.status = 413
      throw error
    }
    const auditId = `${timestamp.replace(/[^0-9]/g, '')}-${randomUUID()}`
    const audit = {
      id: auditId,
      householdId: scope,
      entityType,
      entityId: id,
      action: current ? (next.status === 'archived' && current.status !== 'archived' ? 'archive' : 'update') : 'create',
      actor,
      occurredAt: timestamp,
      fromVersion: current?.version || 0,
      toVersion: next.version,
      beforeHash: current ? estateFingerprint(current) : null,
      afterHash: estateFingerprint(next),
      state: 'pending',
    }
    await store.setJSON(auditKey(scope, auditId, 'pending'), audit)
    await store.setJSON(estateRecordKey(scope, entityType, id), next)
    await store.setJSON(auditKey(scope, auditId, 'committed'), { ...audit, state: 'committed', committedAt: now() })
    return next
  }

  const archive = async ({ entityType, id, actor, expectedVersion }) => {
    const current = await get(entityType, id)
    if (!current) {
      const error = new Error('Estate record not found.')
      error.status = 404
      throw error
    }
    return save({ entityType, entity: { ...current, status: 'archived', archivedAt: now(), archivedBy: actor }, actor, expectedVersion })
  }

  const summary = async propertyId => {
    const properties = await list('property')
    const property = propertyId ? properties.find(item => item.id === propertyId) || null : properties[0] || null
    if (!property) return { property: null, counts: {}, metrics: {}, alerts: [], generatedAt: now() }
    const types = ['propertySystem', 'asset', 'maintenancePlan', 'maintenanceEvent', 'workOrder', 'propertyProject', 'vendor', 'warranty', 'propertyDocument', 'insurancePolicy', 'insuranceClaim', 'utility', 'propertyExpense']
    const values = Object.fromEntries(await Promise.all(types.map(async type => [type, await list(type, type === 'vendor' ? {} : { propertyId: property.id })])))
    const today = now().slice(0, 10)
    const in90Days = new Date(`${today}T12:00:00Z`); in90Days.setUTCDate(in90Days.getUTCDate() + 90)
    const horizon = in90Days.toISOString().slice(0, 10)
    const openWorkOrders = values.workOrder.filter(item => !CLOSED_WORK_STATUSES.has(item.status))
    const overdueMaintenance = values.maintenanceEvent.filter(item => item.dueDate && item.dueDate < today && !CLOSED_WORK_STATUSES.has(item.status))
    const upcomingMaintenance = values.maintenanceEvent.filter(item => item.dueDate >= today && item.dueDate <= horizon && !CLOSED_WORK_STATUSES.has(item.status))
    const activeProjects = values.propertyProject.filter(item => ACTIVE_PROJECT_STATUSES.has(item.status))
    const expiringWarranties = values.warranty.filter(item => item.expirationDate >= today && item.expirationDate <= horizon)
    const unresolvedDecisions = activeProjects.reduce((sum, item) => sum + Number(item.openDecisionCount || (item.status === 'decision_required' ? 1 : 0)), 0)
    const currentYear = today.slice(0, 4)
    const recentSpending = values.propertyExpense.filter(item => String(item.expenseDate || item.createdAt || '').startsWith(currentYear)).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const projectBudgetExposure = activeProjects.reduce((sum, item) => sum + Number(item.budget || item.estimatedCost || 0), 0)
    const alerts = [
      ...overdueMaintenance.slice(0, 5).map(item => ({ type: 'overdue-maintenance', entityType: 'maintenanceEvent', entityId: item.id, title: item.title, dueDate: item.dueDate })),
      ...expiringWarranties.slice(0, 5).map(item => ({ type: 'warranty-expiration', entityType: 'warranty', entityId: item.id, title: item.title, dueDate: item.expirationDate })),
    ]
    return {
      property,
      counts: Object.fromEntries(Object.entries(values).map(([type, records]) => [type, records.length])),
      metrics: { openWorkOrders: openWorkOrders.length, overdueMaintenance: overdueMaintenance.length, upcomingMaintenance: upcomingMaintenance.length, activeProjects: activeProjects.length, expiringWarranties: expiringWarranties.length, unresolvedDecisions, recentSpending, projectBudgetExposure },
      alerts,
      generatedAt: now(),
    }
  }

  const exportAll = async () => {
    const records = Object.fromEntries(await Promise.all(ESTATE_ENTITY_TYPES.map(async type => [type, await list(type, { includeArchived: true })])))
    const auditRecords = await listedRecords(store, auditPrefix(scope))
    const auditEntries = auditRecords.filter(entry => entry.state === 'committed').sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
    const pendingAuditEntries = auditRecords.filter(entry => entry.state === 'pending' && !auditEntries.some(committed => committed.id === entry.id))
    return {
      schemaVersion: 1,
      householdId: scope,
      exportedAt: now(),
      counts: Object.fromEntries(Object.entries(records).map(([type, values]) => [type, values.length])),
      auditCount: auditEntries.length,
      incompleteAuditCount: pendingAuditEntries.length,
      records,
      auditEntries,
      pendingAuditEntries,
    }
  }

  return { get, list, save, archive, summary, exportAll }
}

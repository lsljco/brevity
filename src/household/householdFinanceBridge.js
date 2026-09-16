import { HOUSEHOLD_INVENTORY_STORAGE_KEY, inventoryIntelligence, normalizeInventoryState } from './householdInventoryData.js'
import { getHouseholdDateKey } from '../finance/financeTime.js'

export const HOUSEHOLD_FINANCE_BRIDGE_KEY = 'brevity_household_finance_bridge_v1'
export const HOUSEHOLD_FINANCE_BRIDGE_WRITE_BLOCKED = 'Finance projections are read-only until this source is routed through reviewed Action Mode with Audit History, Undo, and version-conflict protection.'

const money = value => Math.round(Number(value || 0) * 100) / 100
const dateKey = value => String(value || '').slice(0, 10)
const householdMonthForTimestamp = value => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value || '').slice(0, 7) : getHouseholdDateKey(parsed).slice(0, 7)
}

export function buildHouseholdFinanceBridge({ inventoryState = {}, estateWorkspace = null, today = new Date() } = {}) {
  const inventory = normalizeInventoryState(inventoryState)
  const intelligence = inventoryIntelligence(inventory, { today })
  const purchaseObligations = intelligence.purchaseList.map(item => ({
    id: `inventory-${item.id}`,
    source: 'household-inventory',
    sourceId: item.id,
    title: `Replenish ${item.name}`,
    category: item.category,
    amount: money(item.suggestedQuantity * Number(item.unitCost || 0)),
    quantity: item.suggestedQuantity,
    unit: item.unit,
    timing: 'next-purchase',
    status: 'projected',
  })).filter(item => item.amount > 0)

  const maintenanceObligations = (estateWorkspace?.maintenanceEvents || [])
    .filter(event => !['completed', 'cost_recorded', 'cancelled'].includes(event.status))
    .map(event => {
      const plan = (estateWorkspace?.maintenancePlans || []).find(candidate => candidate.id === event.maintenancePlanId)
      const workOrder = (estateWorkspace?.workOrders || []).find(candidate => candidate.id === event.workOrderId)
      return {
        id: `estate-${event.id}`,
        source: 'estate-maintenance',
        sourceId: event.id,
        title: workOrder?.title || plan?.title || 'Estate maintenance',
        amount: money(plan?.expectedCost),
        date: dateKey(event.scheduledFor),
        status: 'projected',
        responsibleMember: plan?.responsibleMember || 'Family',
        vendorId: plan?.preferredVendorId || '',
      }
    }).filter(item => item.amount > 0)

  const month = getHouseholdDateKey(today).slice(0, 7)
  const waste = inventory.waste.filter(entry => householdMonthForTimestamp(entry.recordedAt) === month)
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    inventory: {
      onHandValue: money(intelligence.inventoryValue),
      projectedReplenishment: money(purchaseObligations.reduce((sum, item) => sum + item.amount, 0)),
      monthlyWaste: money(intelligence.monthlyWaste),
      waste,
      purchaseObligations,
    },
    estate: {
      projectedMaintenance: money(maintenanceObligations.reduce((sum, item) => sum + item.amount, 0)),
      maintenanceObligations,
    },
    projectedHouseholdObligations: money([...purchaseObligations, ...maintenanceObligations].reduce((sum, item) => sum + item.amount, 0)),
  }
}

export function readHouseholdFinanceProjection(storage = window.localStorage, { estateWorkspace = null, today = new Date() } = {}) {
  let inventoryState={}
  try { inventoryState=JSON.parse(storage.getItem(HOUSEHOLD_INVENTORY_STORAGE_KEY) || '{}') } catch {}
  return buildHouseholdFinanceBridge({inventoryState,estateWorkspace,today})
}

export function publishHouseholdFinanceBridge(storage = window.localStorage, estateWorkspace = null, { authorized = false } = {}) {
  if (!authorized) return null
  let inventoryState = {}
  try { inventoryState = JSON.parse(storage.getItem(HOUSEHOLD_INVENTORY_STORAGE_KEY) || '{}') } catch {}
  return {
    ok:false,
    blocked:true,
    code:'ACTION_REVIEW_REQUIRED',
    message:HOUSEHOLD_FINANCE_BRIDGE_WRITE_BLOCKED,
    preview:buildHouseholdFinanceBridge({ inventoryState, estateWorkspace }),
  }
}

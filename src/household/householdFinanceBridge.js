import { HOUSEHOLD_INVENTORY_STORAGE_KEY, inventoryIntelligence, normalizeInventoryState } from './householdInventoryData.js'

export const HOUSEHOLD_FINANCE_BRIDGE_KEY = 'brevity_household_finance_bridge_v1'

const money = value => Math.round(Number(value || 0) * 100) / 100
const dateKey = value => String(value || '').slice(0, 10)

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

  const month = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
  const waste = inventory.waste.filter(entry => String(entry.recordedAt || '').slice(0,7) === month)
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

export function publishHouseholdFinanceBridge(storage = window.localStorage, estateWorkspace = null) {
  let inventoryState = {}
  try { inventoryState = JSON.parse(storage.getItem(HOUSEHOLD_INVENTORY_STORAGE_KEY) || '{}') } catch {}
  const bridge = buildHouseholdFinanceBridge({ inventoryState, estateWorkspace })
  storage.setItem(HOUSEHOLD_FINANCE_BRIDGE_KEY, JSON.stringify(bridge))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('brevity-household-finance-updated', { detail: bridge }))
  return bridge
}

import { buildHouseholdMaintenanceWeek, householdOccurrence, maintenanceDateKey, normalizeHouseholdMaintenanceState, HOUSEHOLD_MAINTENANCE_STORAGE_KEY } from './householdMaintenanceData.js'
import { HOUSEHOLD_INVENTORY_STORAGE_KEY, inventoryIntelligence, normalizeInventoryState } from './householdInventoryData.js'
import { HOUSEHOLD_FINANCE_BRIDGE_KEY } from './householdFinanceBridge.js'

const parse = (storage, key, fallback = {}) => { try { return JSON.parse(storage.getItem(key) || '') || fallback } catch { return fallback } }
const money = value => Number(value || 0)

export function buildUnifiedHouseholdIntelligence({ storage = window.localStorage, currentMember = 'Family', today = new Date() } = {}) {
  const todayKey = maintenanceDateKey(today)
  const operationsState = normalizeHouseholdMaintenanceState(parse(storage, HOUSEHOLD_MAINTENANCE_STORAGE_KEY, {}))
  const inventoryState = normalizeInventoryState(parse(storage, HOUSEHOLD_INVENTORY_STORAGE_KEY, {}))
  const financeBridge = parse(storage, HOUSEHOLD_FINANCE_BRIDGE_KEY, {})
  const week = buildHouseholdMaintenanceWeek(today)
  const inventory = inventoryIntelligence(inventoryState, { today })
  const todayTasks = week.flatMap(day => day.date === todayKey ? day.tasks : [])
  const memberTasks = todayTasks.filter(task => task.owners.includes('Everyone') || task.owners.includes(currentMember) || householdOccurrence(operationsState, task).coveredBy === currentMember)
  const exceptions = week.flatMap(day => day.tasks.map(task => ({ day, task, occurrence: householdOccurrence(operationsState, task) })))
    .filter(item => item.occurrence.exception)
  const overdue = week.flatMap(day => day.tasks.map(task => ({ day, task, occurrence: householdOccurrence(operationsState, task) })))
    .filter(item => item.day.date >= operationsState.trackingStartedOn && item.day.date < todayKey && !item.occurrence.complete)
  const uncompletedMine = memberTasks.filter(task => !householdOccurrence(operationsState, task).complete)
  const obligations = [
    ...(financeBridge.inventory?.purchaseObligations || []),
    ...(financeBridge.estate?.maintenanceObligations || []),
  ].sort((a, b) => money(b.amount) - money(a.amount))

  const signals = []
  overdue.slice(0, 3).forEach(({ task, day }) => signals.push({ id:`overdue-${task.occurrenceId}`, priority:'high', icon:'ti-clock-exclamation', title:`Overdue: ${task.title}`, detail:`${day.label} · ${task.zone}`, action:'household' }))
  exceptions.slice(0, 3).forEach(({ task, occurrence }) => signals.push({ id:`exception-${task.occurrenceId}`, priority:'high', icon:'ti-alert-triangle', title:`Exception: ${task.title}`, detail:occurrence.exception, action:'household' }))
  inventory.expired.slice(0, 2).forEach(item => signals.push({ id:`expired-${item.id}`, priority:'high', icon:'ti-fridge', title:`Use or discard: ${item.name}`, detail:`Expired ${item.expiresOn} · ${item.quantity} ${item.unit} remain`, action:'inventory' }))
  inventory.expiring.slice(0, 2).forEach(item => signals.push({ id:`expiring-${item.id}`, priority:'medium', icon:'ti-clock', title:`Use soon: ${item.name}`, detail:`Use by ${item.expiresOn}`, action:'inventory' }))
  inventory.lowStock.slice(0, 3).forEach(item => signals.push({ id:`low-${item.id}`, priority:'medium', icon:'ti-shopping-cart', title:`Replenish ${item.name}`, detail:`${item.quantity} ${item.unit} on hand · reorder at ${item.parLevel}`, action:'inventory' }))
  const nextMaintenance = (financeBridge.estate?.maintenanceObligations || []).filter(item => !item.date || item.date >= todayKey).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))[0]
  if (nextMaintenance) signals.push({ id:`maintenance-${nextMaintenance.id}`, priority:'medium', icon:'ti-tool', title:nextMaintenance.title, detail:`${nextMaintenance.date || 'Upcoming'} · ${money(nextMaintenance.amount).toLocaleString('en-US',{style:'currency',currency:'USD'})} projected`, action:'estate' })

  return {
    signals,
    metrics: {
      myResponsibilitiesToday: uncompletedMine.length,
      householdOverdue: overdue.length,
      lowStock: inventory.lowStock.length,
      useSoon: inventory.expiring.length + inventory.expired.length,
      monthlyWaste: money(inventory.monthlyWaste),
      projectedObligations: money(financeBridge.projectedHouseholdObligations),
    },
    obligations: obligations.slice(0, 5),
    allClear: signals.length === 0,
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUnifiedHouseholdIntelligence } from './householdIntelligence.js'
import { HOUSEHOLD_MAINTENANCE_STORAGE_KEY, buildHouseholdMaintenanceWeek } from './householdMaintenanceData.js'
import { HOUSEHOLD_INVENTORY_STORAGE_KEY } from './householdInventoryData.js'
import { HOUSEHOLD_FINANCE_BRIDGE_KEY } from './householdFinanceBridge.js'

function storage(records = {}) {
  return { getItem: key => Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null }
}

test('Today intelligence combines member work, inventory risk, waste, and projected obligations', () => {
  const today = new Date(2026, 8, 3)
  const week = buildHouseholdMaintenanceWeek(today)
  const yesterdayTask = week.find(day => day.date === '2026-09-02').tasks[0]
  const records = {
    [HOUSEHOLD_MAINTENANCE_STORAGE_KEY]: JSON.stringify({ trackingStartedOn:'2026-08-31', occurrences:{ [yesterdayTask.occurrenceId]:{ complete:false } } }),
    [HOUSEHOLD_INVENTORY_STORAGE_KEY]: JSON.stringify({ items:[{ id:'milk', name:'Milk', category:'Refrigerator', location:'Refrigerator', quantity:1, unit:'carton', parLevel:2, unitCost:6, expiresOn:'2026-09-03' }], waste:[{ id:'w1', estimatedValue:14, recordedAt:'2026-09-02T12:00:00Z' }] }),
    [HOUSEHOLD_FINANCE_BRIDGE_KEY]: JSON.stringify({ projectedHouseholdObligations:125, inventory:{ purchaseObligations:[{ id:'inventory-milk', source:'household-inventory', title:'Replenish Milk', amount:18, quantity:3, unit:'carton' }] }, estate:{ maintenanceObligations:[{ id:'estate-hvac', source:'estate-maintenance', title:'HVAC service', amount:107, date:'2026-09-05' }] } }),
  }
  const model = buildUnifiedHouseholdIntelligence({ storage:storage(records), currentMember:'Nyla', today })
  assert.equal(model.metrics.projectedObligations, 125)
  assert.equal(model.metrics.monthlyWaste, 14)
  assert.equal(model.metrics.lowStock, 1)
  assert.ok(model.metrics.householdOverdue > 0)
  assert.ok(model.signals.some(signal => signal.title.includes('Replenish Milk')))
  assert.ok(model.signals.some(signal => signal.title === 'HVAC service'))
})

test('Today intelligence is all clear when no operating exceptions exist', () => {
  const today = new Date(2026, 8, 3)
  const week = buildHouseholdMaintenanceWeek(today)
  const occurrences = Object.fromEntries(week.flatMap(day => day.date < '2026-09-03' ? day.tasks.map(task => [task.occurrenceId, { complete:true }]) : []))
  const records = {
    [HOUSEHOLD_MAINTENANCE_STORAGE_KEY]: JSON.stringify({ trackingStartedOn:'2026-08-31', occurrences }),
    [HOUSEHOLD_INVENTORY_STORAGE_KEY]: JSON.stringify({ items:[], waste:[] }),
    [HOUSEHOLD_FINANCE_BRIDGE_KEY]: JSON.stringify({ projectedHouseholdObligations:0, inventory:{ purchaseObligations:[] }, estate:{ maintenanceObligations:[] } }),
  }
  const model = buildUnifiedHouseholdIntelligence({ storage:storage(records), currentMember:'Larry', today })
  assert.equal(model.signals.length, 0)
  assert.equal(model.allClear, true)
})

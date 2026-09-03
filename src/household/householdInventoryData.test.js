import assert from 'node:assert/strict'
import test from 'node:test'
import { addInventoryItem, inventoryIntelligence, normalizeInventoryState, recordInventoryWaste } from './householdInventoryData.js'

test('inventory intelligence identifies low stock and purchase quantities', () => {
  const state = addInventoryItem(normalizeInventoryState(), { name:'Paper towels', quantity:2, parLevel:2, unit:'rolls', unitCost:2.5 }, 'Larry')
  const summary = inventoryIntelligence(state, { today:new Date('2026-09-03T12:00:00') })
  assert.equal(summary.lowStock.length, 1)
  assert.equal(summary.purchaseList[0].suggestedQuantity, 2)
  assert.equal(summary.inventoryValue, 5)
})

test('waste reduces on-hand inventory and records estimated financial waste', () => {
  let state = addInventoryItem(normalizeInventoryState(), { name:'Prepared meatloaf', quantity:4, parLevel:0, unit:'servings', unitCost:6 }, 'Terica')
  const item = state.items[0]
  state = recordInventoryWaste(state, { itemId:item.id, quantity:2, reason:'Not eaten', member:'Larry' })
  assert.equal(state.items[0].quantity, 2)
  assert.equal(state.waste[0].estimatedValue, 12)
})

test('inventory intelligence flags food approaching expiration', () => {
  const state = addInventoryItem(normalizeInventoryState(), { name:'Leftovers', quantity:2, parLevel:0, expiresOn:'2026-09-05' }, 'Larry')
  const summary = inventoryIntelligence(state, { today:new Date('2026-09-03T12:00:00') })
  assert.equal(summary.expiring.length, 1)
})

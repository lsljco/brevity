import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHouseholdFinanceBridge, HOUSEHOLD_FINANCE_BRIDGE_WRITE_BLOCKED, publishHouseholdFinanceBridge } from './householdFinanceBridge.js'
test('household finance bridge projects inventory, waste and estate obligations without inventing posted transactions',()=>{const bridge=buildHouseholdFinanceBridge({today:new Date('2026-09-03T12:00:00'),inventoryState:{items:[{id:'paper',name:'Paper towels',quantity:1,parLevel:3,unit:'packs',unitCost:12,category:'Paper Goods'}],waste:[{recordedAt:'2026-09-02T10:00:00Z',estimatedValue:18}]},estateWorkspace:{maintenancePlans:[{id:'plan',title:'HVAC service',expectedCost:250}],maintenanceEvents:[{id:'event',maintenancePlanId:'plan',workOrderId:'work',scheduledFor:'2026-09-10',status:'due'}],workOrders:[{id:'work',title:'HVAC service'}]}});assert.equal(bridge.inventory.projectedReplenishment,60);assert.equal(bridge.inventory.monthlyWaste,18);assert.equal(bridge.estate.projectedMaintenance,250);assert.equal(bridge.projectedHouseholdObligations,310);assert.equal(bridge.inventory.purchaseObligations[0].status,'projected')})
test('household finance bridge anchors month totals to the household timezone',()=>{const bridge=buildHouseholdFinanceBridge({today:new Date('2026-09-01T02:30:00.000Z'),inventoryState:{items:[],waste:[{recordedAt:'2026-09-01T02:15:00.000Z',estimatedValue:9},{recordedAt:'2026-09-01T05:15:00.000Z',estimatedValue:11}]}});assert.equal(bridge.inventory.monthlyWaste,9);assert.equal(bridge.inventory.waste.length,1)})

test('publishing the finance bridge never writes an unaudited shared record',()=>{
  const values=new Map([['brevity_household_inventory_v1',JSON.stringify({items:[],waste:[]})]])
  const writes=[]
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{writes.push(key);values.set(key,value)}}
  assert.equal(publishHouseholdFinanceBridge(storage),null)
  assert.deepEqual(writes,[])
  const result=publishHouseholdFinanceBridge(storage,null,{authorized:true})
  assert.equal(result.ok,false)
  assert.equal(result.blocked,true)
  assert.equal(result.code,'ACTION_REVIEW_REQUIRED')
  assert.equal(result.message,HOUSEHOLD_FINANCE_BRIDGE_WRITE_BLOCKED)
  assert.equal(result.preview.version,1)
  assert.deepEqual(writes,[])
})
